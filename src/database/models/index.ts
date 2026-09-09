import logger from '@/utils/logger';
import { User } from './user.model';
import { Role } from './roles.model';
import { Permission } from './permissions.model';
import { RefreshToken } from './refresh-token.model';
import { LightspeedConfig } from './lightspeed-config.model';
import { Shop } from './shop.model';
import { Vendor } from './vendor.model';
import { Brand } from './brand.model';
import { Category } from './category.model';
import { Tag } from './tag.model';
import { ProductTag } from './product-tag.model';
import { ProductMatrix } from './product-matrix.model';
import { Product } from './product.model';
import { ItemAttributeSet } from './item-attribute-set.model';
import { ProductVendor } from './product-vendor.model';
import { ProductInventory } from './product-inventory.model';
import { ProductImage } from './product-image.model';
import { LightspeedEntityMap } from './lightspeed-entity-map.model';
import { LightspeedSyncState } from './lightspeed-sync-state.model';
import { LightspeedSyncJob } from './lightspeed-sync-job.model';
import { LightspeedSchedulerJob } from './lightspeed-scheduler-job.model';
import { CustomerType } from './customer-type.model';
import { CreditAccount } from './credit-account.model';
import { Customer } from './customer.model';
import { Discount } from './discount.model';
import { TaxCategory } from './tax-category.model';
import { TaxClass } from './tax-class.model';
import { ContactSubmission } from './contact-submission.model';
import { HomepageBanner } from './homepage-banner.model';
import { PriceLevel } from './price-level.model';
import { CurrencyRate } from './currency-rate.model';
import { Order } from './order.model';
import { OrderItem } from './order-item.model';
import { PaymentTransaction } from './payment-transaction.model';
import { InventoryReservation } from './inventory-reservation.model';
import { Register } from './register.model';
import { Employee } from './employee.model';
import { ProductSalesStats } from './product-sales-stats.model';
import { POSSale } from './pos-sale.model';
import { POSSaleLine } from './pos-sale-line.model';

export const setupAssociations = () => {
  // Auth Associations
  User.belongsTo(Role, {
    foreignKey: 'role',
    as: 'roles',
  });

  Role.hasMany(Permission, {
    foreignKey: 'role_id',
    as: 'permissions',
  });

  Permission.belongsTo(Role, {
    foreignKey: 'role_id',
    as: 'role',
  });

  // Product Matrix Associations
  ProductMatrix.belongsTo(Brand, { foreignKey: 'brand_id', as: 'brand' });
  ProductMatrix.belongsTo(Category, { foreignKey: 'category_id', as: 'category' });
  ProductMatrix.belongsTo(Vendor, { foreignKey: 'vendor_id', as: 'vendor' });
  ProductMatrix.belongsTo(ItemAttributeSet, { foreignKey: 'item_attribute_set_id', as: 'attributeSet' });
  ItemAttributeSet.hasMany(ProductMatrix, { foreignKey: 'item_attribute_set_id', as: 'matrices' });
  ProductMatrix.hasMany(Product, { foreignKey: 'product_matrix_id', as: 'variants' });

  // Product Associations
  Product.belongsTo(ProductMatrix, { foreignKey: 'product_matrix_id', as: 'matrix' });
  Product.belongsTo(Brand, { foreignKey: 'brand_id', as: 'brand' });
  Product.belongsTo(Category, { foreignKey: 'category_id', as: 'category' });
  Product.hasMany(ProductVendor, { foreignKey: 'product_id', as: 'productVendors' });
  Product.hasMany(ProductInventory, { foreignKey: 'product_id', as: 'inventories' });
  Product.hasMany(ProductImage, { foreignKey: 'product_id', as: 'images' });
  Product.belongsToMany(Tag, {
    through: ProductTag,
    foreignKey: 'product_id',
    otherKey: 'tag_id',
    as: 'tags',
  });

  // Category Self-Reference
  Category.belongsTo(Category, { foreignKey: 'parent_id', as: 'parent' });
  Category.hasMany(Category, { foreignKey: 'parent_id', as: 'children' });

  // ProductVendor Associations
  ProductVendor.belongsTo(Product, { foreignKey: 'product_id', as: 'product' });
  ProductVendor.belongsTo(Vendor, { foreignKey: 'vendor_id', as: 'vendor' });

  // ProductInventory Associations
  ProductInventory.belongsTo(Product, { foreignKey: 'product_id', as: 'product' });
  ProductInventory.belongsTo(Shop, { foreignKey: 'shop_id', as: 'shop' });

  // ProductImage Associations
  ProductImage.belongsTo(Product, { foreignKey: 'product_id', as: 'product' });

  // Tag Associations
  Tag.belongsToMany(Product, {
    through: ProductTag,
    foreignKey: 'tag_id',
    otherKey: 'product_id',
    as: 'products',
  });

  // Customer Associations
  Customer.belongsTo(CustomerType, { foreignKey: 'customer_type_id', as: 'customerType' });
  CustomerType.hasMany(Customer, { foreignKey: 'customer_type_id', as: 'customers' });

  Customer.belongsTo(CreditAccount, { foreignKey: 'credit_account_id', as: 'creditAccount' });
  CreditAccount.hasMany(Customer, { foreignKey: 'credit_account_id', as: 'customers' });

  CustomerType.belongsTo(Discount, { foreignKey: 'discount_id', as: 'discount' });
  Discount.hasMany(CustomerType, { foreignKey: 'discount_id', as: 'customerTypes' });

  CustomerType.belongsTo(TaxCategory, { foreignKey: 'tax_category_id', as: 'taxCategory' });
  TaxCategory.hasMany(CustomerType, { foreignKey: 'tax_category_id', as: 'customerTypes' });

  Customer.belongsTo(TaxCategory, { foreignKey: 'tax_category_id', as: 'taxCategory' });
  TaxCategory.hasMany(Customer, { foreignKey: 'tax_category_id', as: 'customers' });

  Customer.belongsTo(Discount, { foreignKey: 'discount_id', as: 'discount' });
  Discount.hasMany(Customer, { foreignKey: 'discount_id', as: 'customers' });

  // Order Associations
  Order.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
  User.hasMany(Order, { foreignKey: 'user_id', as: 'orders' });

  Order.hasMany(OrderItem, { foreignKey: 'order_id', as: 'items' });
  OrderItem.belongsTo(Order, { foreignKey: 'order_id', as: 'order' });

  OrderItem.belongsTo(Product, { foreignKey: 'product_id', as: 'product' });
  Product.hasMany(OrderItem, { foreignKey: 'product_id', as: 'orderItems' });

  Order.hasMany(PaymentTransaction, { foreignKey: 'order_id', as: 'transactions' });
  PaymentTransaction.belongsTo(Order, { foreignKey: 'order_id', as: 'order' });

  Order.hasMany(InventoryReservation, { foreignKey: 'order_id', as: 'reservations' });
  InventoryReservation.belongsTo(Order, { foreignKey: 'order_id', as: 'order' });

  InventoryReservation.belongsTo(Product, { foreignKey: 'product_id', as: 'product' });
  Product.hasMany(InventoryReservation, { foreignKey: 'product_id', as: 'reservations' });

  // Register & Employee Associations
  Register.belongsTo(Shop, { foreignKey: 'shop_id', as: 'shop' });
  Shop.hasMany(Register, { foreignKey: 'shop_id', as: 'registers' });

  Register.belongsTo(Employee, { foreignKey: 'open_employee_id', as: 'openEmployee' });
  Employee.hasMany(Register, { foreignKey: 'open_employee_id', as: 'openedRegisters' });

  Employee.belongsTo(Shop, { foreignKey: 'limit_to_shop_id', as: 'limitShop' });
  Employee.belongsTo(Shop, { foreignKey: 'last_shop_id', as: 'lastShop' });

  Product.belongsTo(TaxClass, {
    foreignKey: 'tax_class_id',
    targetKey: 'lightspeed_tax_class_id',
    as: 'taxClass',
    constraints: false,
  });
  TaxClass.hasMany(Product, {
    foreignKey: 'tax_class_id',
    sourceKey: 'lightspeed_tax_class_id',
    as: 'products',
    constraints: false,
  });

  Product.hasOne(ProductSalesStats, { foreignKey: 'product_id', as: 'salesStats' });
  ProductSalesStats.belongsTo(Product, { foreignKey: 'product_id', as: 'product' });

  // POS Sale Associations
  POSSale.hasMany(POSSaleLine, { foreignKey: 'sale_id', as: 'lines' });
  POSSaleLine.belongsTo(POSSale, { foreignKey: 'sale_id', as: 'sale' });

  POSSaleLine.belongsTo(Product, { foreignKey: 'product_id', as: 'product' });
  Product.hasMany(POSSaleLine, { foreignKey: 'product_id', as: 'posSaleLines' });

  POSSale.belongsTo(Shop, { foreignKey: 'shop_id', as: 'shop' });
  Shop.hasMany(POSSale, { foreignKey: 'shop_id', as: 'posSales' });

  POSSale.belongsTo(Customer, { foreignKey: 'customer_id', as: 'customer' });
  Customer.hasMany(POSSale, { foreignKey: 'customer_id', as: 'posSales' });

  POSSale.belongsTo(Employee, { foreignKey: 'employee_id', as: 'employee' });
  Employee.hasMany(POSSale, { foreignKey: 'employee_id', as: 'posSales' });

  POSSale.belongsTo(Register, { foreignKey: 'register_id', as: 'register' });
  Register.hasMany(POSSale, { foreignKey: 'register_id', as: 'posSales' });

  logger.info('Model associations have been set up.');
};

export {
  User,
  Role,
  Permission,
  RefreshToken,
  LightspeedConfig,
  Shop,
  Register,
  Employee,
  Vendor,
  Brand,
  Category,
  Tag,
  ProductTag,
  ProductMatrix,
  Product,
  ItemAttributeSet,
  ProductVendor,
  ProductInventory,
  ProductImage,
  LightspeedEntityMap,
  LightspeedSyncState,
  LightspeedSyncJob,
  LightspeedSchedulerJob,
  CustomerType,
  CreditAccount,
  Customer,
  Discount,
  TaxCategory,
  TaxClass,
  ContactSubmission,
  HomepageBanner,
  PriceLevel,
  CurrencyRate,
  Order,
  OrderItem,
  PaymentTransaction,
  InventoryReservation,
  ProductSalesStats,
  POSSale,
  POSSaleLine,
};
