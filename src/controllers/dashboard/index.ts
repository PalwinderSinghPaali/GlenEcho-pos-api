import { Request, Response } from 'express';
import sequelize from '@/database/connection';
import logger from '@/utils/logger';

export type DashboardSource = 'all' | 'web' | 'pos';

/**
 * Normalizes and extracts the source query parameter.
 * Supports:
 * - 'all' (default): Combined web orders + in-store POS sales.
 * - 'web' or 'online': Web e-commerce orders only.
 * - 'pos' or 'instore': Physical in-store POS register sales only (excluding web orders pushed to POS).
 */
export function parseDashboardSource(srcQuery: any): DashboardSource {
  if (Array.isArray(srcQuery)) {
    srcQuery = srcQuery.join(',');
  }
  const s = String(srcQuery || 'all').trim().toLowerCase();
  if (s === 'web' || s === 'online') return 'web';
  if (s === 'pos' || s === 'instore' || s === 'in_store' || s === 'in-store') return 'pos';
  return 'all';
}

/**
 * SQL condition that filters pos_sales to ONLY in-store register sales
 * (excluding POS sales that originated from synced web orders).
 */
const IN_STORE_POS_ONLY_CONDITION = `
  lightspeed_sale_id NOT IN (
    SELECT lightspeed_sale_id
    FROM orders
    WHERE lightspeed_sale_id IS NOT NULL AND deleted_at IS NULL
  )
`;

/**
 * Dashboard Collections (Revenue)
 * Calculates Today, Yesterday, Weekly (last 7 days), Monthly (this month),
 * Last Month, and All-Time collection amounts.
 */
export const getCollectionsData = async (source: DashboardSource = 'all') => {
  let webToday = 0;
  let webYesterday = 0;
  let webWeekly = 0;
  let webThisMonth = 0;
  let webLastMonth = 0;
  let webAllTime = 0;

  let posToday = 0;
  let posYesterday = 0;
  let posWeekly = 0;
  let posThisMonth = 0;
  let posLastMonth = 0;
  let posAllTime = 0;

  if (source === 'all' || source === 'web') {
    const [webCol]: any = await sequelize.query(`
      SELECT
        COALESCE(SUM(CASE WHEN created_at >= DATE_TRUNC('day', NOW()) THEN total_amount ELSE 0 END), 0) AS today,
        COALESCE(SUM(CASE WHEN created_at >= DATE_TRUNC('day', NOW() - INTERVAL '1 day') AND created_at < DATE_TRUNC('day', NOW()) THEN total_amount ELSE 0 END), 0) AS yesterday,
        COALESCE(SUM(CASE WHEN created_at >= NOW() - INTERVAL '7 days' THEN total_amount ELSE 0 END), 0) AS weekly,
        COALESCE(SUM(CASE WHEN created_at >= DATE_TRUNC('month', NOW()) THEN total_amount ELSE 0 END), 0) AS this_month,
        COALESCE(SUM(CASE WHEN created_at >= DATE_TRUNC('month', NOW() - INTERVAL '1 month') AND created_at < DATE_TRUNC('month', NOW()) THEN total_amount ELSE 0 END), 0) AS last_month,
        COALESCE(SUM(total_amount), 0) AS all_time
      FROM orders
      WHERE status NOT IN ('cancelled', 'pending_payment')
        AND deleted_at IS NULL
    `);

    if (webCol && webCol.length > 0) {
      webToday = parseFloat(webCol[0].today || 0);
      webYesterday = parseFloat(webCol[0].yesterday || 0);
      webWeekly = parseFloat(webCol[0].weekly || 0);
      webThisMonth = parseFloat(webCol[0].this_month || 0);
      webLastMonth = parseFloat(webCol[0].last_month || 0);
      webAllTime = parseFloat(webCol[0].all_time || 0);
    }
  }

  if (source === 'all' || source === 'pos') {
    // In-store POS sales ONLY (excluding web orders pushed to POS)
    const [posCol]: any = await sequelize.query(`
      SELECT
        COALESCE(SUM(CASE WHEN sale_time >= DATE_TRUNC('day', NOW()) THEN total ELSE 0 END), 0) AS today,
        COALESCE(SUM(CASE WHEN sale_time >= DATE_TRUNC('day', NOW() - INTERVAL '1 day') AND sale_time < DATE_TRUNC('day', NOW()) THEN total ELSE 0 END), 0) AS yesterday,
        COALESCE(SUM(CASE WHEN sale_time >= NOW() - INTERVAL '7 days' THEN total ELSE 0 END), 0) AS weekly,
        COALESCE(SUM(CASE WHEN sale_time >= DATE_TRUNC('month', NOW()) THEN total ELSE 0 END), 0) AS this_month,
        COALESCE(SUM(CASE WHEN sale_time >= DATE_TRUNC('month', NOW() - INTERVAL '1 month') AND sale_time < DATE_TRUNC('month', NOW()) THEN total ELSE 0 END), 0) AS last_month,
        COALESCE(SUM(total), 0) AS all_time
      FROM pos_sales
      WHERE completed = true
        AND voided = false
        AND ${IN_STORE_POS_ONLY_CONDITION}
    `);

    if (posCol && posCol.length > 0) {
      posToday = parseFloat(posCol[0].today || 0);
      posYesterday = parseFloat(posCol[0].yesterday || 0);
      posWeekly = parseFloat(posCol[0].weekly || 0);
      posThisMonth = parseFloat(posCol[0].this_month || 0);
      posLastMonth = parseFloat(posCol[0].last_month || 0);
      posAllTime = parseFloat(posCol[0].all_time || 0);
    }
  }

  const round = (num: number) => Math.round(num * 100) / 100;

  if (source === 'web') {
    return {
      today: round(webToday),
      yesterday: round(webYesterday),
      weekly: round(webWeekly),
      thisMonth: round(webThisMonth),
      lastMonth: round(webLastMonth),
      allTime: round(webAllTime),
    };
  }

  if (source === 'pos') {
    return {
      today: round(posToday),
      yesterday: round(posYesterday),
      weekly: round(posWeekly),
      thisMonth: round(posThisMonth),
      lastMonth: round(posLastMonth),
      allTime: round(posAllTime),
    };
  }

  // source === 'all': Total is Web + in-store POS
  return {
    today: round(webToday + posToday),
    yesterday: round(webYesterday + posYesterday),
    weekly: round(webWeekly + posWeekly),
    thisMonth: round(webThisMonth + posThisMonth),
    lastMonth: round(webLastMonth + posLastMonth),
    allTime: round(webAllTime + posAllTime),
    breakdown: {
      web: {
        today: round(webToday),
        yesterday: round(webYesterday),
        weekly: round(webWeekly),
        thisMonth: round(webThisMonth),
        lastMonth: round(webLastMonth),
        allTime: round(webAllTime),
      },
      pos: {
        today: round(posToday),
        yesterday: round(posYesterday),
        weekly: round(posWeekly),
        thisMonth: round(posThisMonth),
        lastMonth: round(posLastMonth),
        allTime: round(posAllTime),
      },
    },
  };
};

/**
 * Dashboard Orders
 * When source === 'web': Web e-commerce orders status counts.
 * When source === 'pos': In-store physical POS transaction counts.
 * When source === 'all': Combined counts across both platforms + breakdown.
 */
export const getOrdersData = async (source: DashboardSource = 'all') => {
  let webStats: any = { today: 0, total: 0, pending: 0, processing: 0, completed: 0, cancelled: 0 };
  let posStats: any = { today: 0, total: 0, pending: 0, processing: 0, completed: 0, cancelled: 0 };

  if (source === 'all' || source === 'web') {
    const [res]: any = await sequelize.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(CASE WHEN created_at >= DATE_TRUNC('day', NOW()) THEN 1 END) AS today,
        COUNT(CASE WHEN status IN ('pending_payment', 'authorized') THEN 1 END) AS pending,
        COUNT(CASE WHEN status IN ('paid', 'synced', 'manual_fulfillment_alert') THEN 1 END) AS processing,
        COUNT(CASE WHEN status IN ('completed', 'shipped') THEN 1 END) AS completed,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) AS cancelled
      FROM orders
      WHERE deleted_at IS NULL
    `);
    if (res && res.length > 0) {
      webStats = {
        today: parseInt(res[0].today || '0', 10),
        total: parseInt(res[0].total || '0', 10),
        pending: parseInt(res[0].pending || '0', 10),
        processing: parseInt(res[0].processing || '0', 10),
        completed: parseInt(res[0].completed || '0', 10),
        cancelled: parseInt(res[0].cancelled || '0', 10),
      };
    }
  }

  if (source === 'all' || source === 'pos') {
    // In-store POS register transactions ONLY
    const [res]: any = await sequelize.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(CASE WHEN sale_time >= DATE_TRUNC('day', NOW()) THEN 1 END) AS today,
        0 AS pending,
        COUNT(CASE WHEN completed = false AND voided = false THEN 1 END) AS processing,
        COUNT(CASE WHEN completed = true AND voided = false THEN 1 END) AS completed,
        COUNT(CASE WHEN voided = true THEN 1 END) AS cancelled
      FROM pos_sales
      WHERE ${IN_STORE_POS_ONLY_CONDITION}
    `);
    if (res && res.length > 0) {
      posStats = {
        today: parseInt(res[0].today || '0', 10),
        total: parseInt(res[0].total || '0', 10),
        pending: 0,
        processing: parseInt(res[0].processing || '0', 10),
        completed: parseInt(res[0].completed || '0', 10),
        cancelled: parseInt(res[0].cancelled || '0', 10),
      };
    }
  }

  if (source === 'web') {
    return webStats;
  }

  if (source === 'pos') {
    return posStats;
  }

  // Combined when source === 'all'
  return {
    today: webStats.today + posStats.today,
    total: webStats.total + posStats.total,
    pending: webStats.pending,
    processing: webStats.processing + posStats.processing,
    completed: webStats.completed + posStats.completed,
    cancelled: webStats.cancelled + posStats.cancelled,
    breakdown: {
      web: webStats,
      pos: posStats,
    },
  };
};

/**
 * Dashboard Weekly Sales & Orders Graph (Last 7 Days)
 * Returns a day-by-day breakdown of revenue collection and order count.
 */
export const getWeeklySalesData = async (source: DashboardSource = 'all') => {
  let salesSubquery = '';

  if (source === 'web') {
    salesSubquery = `
      SELECT
        DATE(created_at) AS sale_date,
        total_amount AS amount,
        id AS sale_ref
      FROM orders
      WHERE status NOT IN ('cancelled', 'pending_payment')
        AND deleted_at IS NULL
    `;
  } else if (source === 'pos') {
    salesSubquery = `
      SELECT
        DATE(sale_time) AS sale_date,
        total AS amount,
        id AS sale_ref
      FROM pos_sales
      WHERE completed = true
        AND voided = false
        AND ${IN_STORE_POS_ONLY_CONDITION}
    `;
  } else {
    // 'all' - Combined web orders and in-store POS sales
    salesSubquery = `
      SELECT
        DATE(created_at) AS sale_date,
        total_amount AS amount,
        id AS sale_ref
      FROM orders
      WHERE status NOT IN ('cancelled', 'pending_payment')
        AND deleted_at IS NULL

      UNION ALL

      SELECT
        DATE(sale_time) AS sale_date,
        total AS amount,
        id AS sale_ref
      FROM pos_sales
      WHERE completed = true
        AND voided = false
        AND ${IN_STORE_POS_ONLY_CONDITION}
    `;
  }

  const [weeklyGraph]: any = await sequelize.query(`
    WITH days AS (
      SELECT generate_series(
        DATE_TRUNC('day', NOW() - INTERVAL '6 days'),
        DATE_TRUNC('day', NOW()),
        INTERVAL '1 day'
      )::date AS day
    ),
    all_sales AS (
      ${salesSubquery}
    )
    SELECT
      days.day,
      TO_CHAR(days.day, 'Mon DD') AS label,
      TO_CHAR(days.day, 'Dy') AS day_of_week,
      COALESCE(SUM(s.amount), 0) AS sales,
      COUNT(s.sale_ref) AS orders
    FROM days
    LEFT JOIN all_sales s ON s.sale_date = days.day
    GROUP BY days.day
    ORDER BY days.day ASC
  `);

  return (weeklyGraph || []).map((row: any) => ({
    date: row.day,
    label: row.label,
    dayOfWeek: row.day_of_week,
    sales: Math.round(parseFloat(row.sales || 0) * 100) / 100,
    orders: parseInt(row.orders || '0', 10),
  }));
};

/**
 * Dashboard Top 5 Highest Selling Products (Pie Chart)
 * Aggregates top products by units sold, total revenue, and calculates percentage share.
 */
export const getTopSellingProductsData = async (source: DashboardSource = 'all', limit: number = 5) => {
  let unionQuery = '';

  if (source === 'web') {
    unionQuery = `
      SELECT
        oi.product_id,
        oi.quantity AS quantity,
        oi.quantity * oi.price AS revenue
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.status NOT IN ('cancelled', 'pending_payment')
        AND o.deleted_at IS NULL
    `;
  } else if (source === 'pos') {
    unionQuery = `
      SELECT
        psl.product_id,
        psl.unit_quantity AS quantity,
        psl.calc_total AS revenue
      FROM pos_sale_lines psl
      JOIN pos_sales ps ON ps.id = psl.sale_id
      WHERE ps.completed = true
        AND ps.voided = false
        AND psl.product_id IS NOT NULL
        AND ps.${IN_STORE_POS_ONLY_CONDITION}
    `;
  } else {
    // 'all' - Combined web orders and in-store POS sales
    unionQuery = `
      SELECT
        oi.product_id,
        oi.quantity AS quantity,
        oi.quantity * oi.price AS revenue
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.status NOT IN ('cancelled', 'pending_payment')
        AND o.deleted_at IS NULL

      UNION ALL

      SELECT
        psl.product_id,
        psl.unit_quantity AS quantity,
        psl.calc_total AS revenue
      FROM pos_sale_lines psl
      JOIN pos_sales ps ON ps.id = psl.sale_id
      WHERE ps.completed = true
        AND ps.voided = false
        AND psl.product_id IS NOT NULL
        AND ps.${IN_STORE_POS_ONLY_CONDITION}
    `;
  }

  const [topProducts]: any = await sequelize.query(`
    WITH combined_sales AS (
      ${unionQuery}
    ),
    aggregated AS (
      SELECT
        product_id,
        SUM(quantity) AS units_sold,
        SUM(revenue) AS total_revenue
      FROM combined_sales
      GROUP BY product_id
    )
    SELECT
      p.id AS product_id,
      p.description AS product_name,
      p.custom_sku AS sku,
      a.units_sold,
      a.total_revenue,
      (
        SELECT COALESCE(pi.local_path, pi.lightspeed_url)
        FROM product_images pi
        WHERE pi.product_id = p.id
        ORDER BY pi.is_featured DESC, pi.id ASC
        LIMIT 1
      ) AS image_url
    FROM aggregated a
    JOIN products p ON p.id = a.product_id
    ORDER BY a.units_sold DESC
    LIMIT :limit
  `, {
    replacements: { limit }
  });

  const totalUnits = (topProducts || []).reduce(
    (sum: number, item: any) => sum + parseFloat(item.units_sold || 0),
    0
  );

  return (topProducts || []).map((item: any) => {
    const units = parseFloat(item.units_sold || 0);
    const revenue = Math.round(parseFloat(item.total_revenue || 0) * 100) / 100;
    const percentage = totalUnits > 0
      ? Math.round((units / totalUnits) * 1000) / 10
      : 0;

    return {
      productId: item.product_id,
      name: item.product_name,
      sku: item.sku,
      unitsSold: units,
      totalRevenue: revenue,
      percentage,
      imageUrl: item.image_url || null,
    };
  });
};

/**
 * 1. GET /api/v1/dashboard/summary (or /api/v1/dashboard)
 * Retrieves full statistical dashboard dataset in a single round-trip.
 */
export const getDashboardSummary = async (req: Request, res: Response) => {
  try {
    const source = parseDashboardSource(req.query.source);
    const limit = Math.max(1, Math.min(20, Number(req.query.topProductsLimit) || 5));

    const [collections, orders, weeklySales, topSellingProducts] = await Promise.all([
      getCollectionsData(source),
      getOrdersData(source),
      getWeeklySalesData(source),
      getTopSellingProductsData(source, limit),
    ]);

    return res.sendSuccess(res, {
      collections,
      orders,
      weeklySales,
      topSellingProducts,
      meta: {
        source,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error: unknown) {
    logger.error('Error fetching dashboard summary:', error);
    return res.sendError(res, 'ERR_INTERNAL_SERVER_ERROR', { error: (error as Error).message });
  }
};

/**
 * 2. GET /api/v1/dashboard/collections
 * Retrieves revenue collection metrics.
 */
export const getDashboardCollections = async (req: Request, res: Response) => {
  try {
    const source = parseDashboardSource(req.query.source);
    const collections = await getCollectionsData(source);
    return res.sendSuccess(res, collections);
  } catch (error: unknown) {
    logger.error('Error fetching dashboard collections:', error);
    return res.sendError(res, 'ERR_INTERNAL_SERVER_ERROR', { error: (error as Error).message });
  }
};

/**
 * 3. GET /api/v1/dashboard/orders
 * Retrieves order status counts.
 */
export const getDashboardOrders = async (req: Request, res: Response) => {
  try {
    const source = parseDashboardSource(req.query.source);
    const orders = await getOrdersData(source);
    return res.sendSuccess(res, orders);
  } catch (error: unknown) {
    logger.error('Error fetching dashboard orders:', error);
    return res.sendError(res, 'ERR_INTERNAL_SERVER_ERROR', { error: (error as Error).message });
  }
};

/**
 * 4. GET /api/v1/dashboard/weekly-sales
 * Retrieves weekly collection and sales/orders graph dataset.
 */
export const getDashboardWeeklySales = async (req: Request, res: Response) => {
  try {
    const source = parseDashboardSource(req.query.source);
    const weeklySales = await getWeeklySalesData(source);
    return res.sendSuccess(res, weeklySales);
  } catch (error: unknown) {
    logger.error('Error fetching dashboard weekly sales:', error);
    return res.sendError(res, 'ERR_INTERNAL_SERVER_ERROR', { error: (error as Error).message });
  }
};

/**
 * 5. GET /api/v1/dashboard/top-products
 * Retrieves top 5 highest selling products with pie chart proportions.
 */
export const getDashboardTopProducts = async (req: Request, res: Response) => {
  try {
    const source = parseDashboardSource(req.query.source);
    const limit = Math.max(1, Math.min(20, Number(req.query.limit) || 5));
    const topProducts = await getTopSellingProductsData(source, limit);
    return res.sendSuccess(res, topProducts);
  } catch (error: unknown) {
    logger.error('Error fetching dashboard top products:', error);
    return res.sendError(res, 'ERR_INTERNAL_SERVER_ERROR', { error: (error as Error).message });
  }
};
