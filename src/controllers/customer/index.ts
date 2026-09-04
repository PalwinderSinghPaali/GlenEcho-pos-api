import { Request, Response } from 'express';
import { Op } from 'sequelize';
import {
  Customer,
  CustomerType,
  CreditAccount,
  TaxCategory,
  Discount,
  LightspeedEntityMap,
} from '@/database/models';
import { LightspeedService } from '@/services/lightspeed';
import sequelize from '@/database/connection';
import logger from '@/utils/logger';

/**
 * Formats a Customer instance for response.
 */
function formatCustomer(cust: any) {
  if (!cust) return null;
  return cust.toJSON ? cust.toJSON() : cust;
}

/**
 * Resolves related entity IDs between local database and Lightspeed POS.
 */
async function resolveAssociations(payload: any) {
  let resolvedCustomerTypeId: number | null = null;
  let lsCustomerTypeId: number | null = null;
  const rawCustomerTypeId = payload.customer_type_id ?? payload.customerTypeId ?? payload.customerTypeID;
  if (rawCustomerTypeId !== undefined && rawCustomerTypeId !== null && rawCustomerTypeId !== '') {
    const num = Number(rawCustomerTypeId);
    let ct = !isNaN(num) ? await CustomerType.findByPk(num) : null;
    if (!ct) {
      ct = await CustomerType.findOne({
        where: { lightspeed_customer_type_id: String(rawCustomerTypeId) },
      });
    }
    if (ct) {
      resolvedCustomerTypeId = ct.id;
      lsCustomerTypeId = ct.lightspeed_customer_type_id
        ? parseInt(ct.lightspeed_customer_type_id, 10) || 0
        : 0;
    } else if (!isNaN(num)) {
      resolvedCustomerTypeId = num;
      lsCustomerTypeId = num;
    }
  }

  let resolvedCreditAccountId: number | null = null;
  let lsCreditAccountId: number | null = null;
  const rawCreditAccountId = payload.credit_account_id ?? payload.creditAccountId ?? payload.creditAccountID;
  if (rawCreditAccountId !== undefined && rawCreditAccountId !== null && rawCreditAccountId !== '') {
    const num = Number(rawCreditAccountId);
    let ca = !isNaN(num) ? await CreditAccount.findByPk(num) : null;
    if (!ca) {
      ca = await CreditAccount.findOne({
        where: { lightspeed_credit_account_id: String(rawCreditAccountId) },
      });
    }
    if (ca) {
      resolvedCreditAccountId = ca.id;
      lsCreditAccountId = ca.lightspeed_credit_account_id
        ? parseInt(ca.lightspeed_credit_account_id, 10) || 0
        : 0;
    } else if (!isNaN(num)) {
      resolvedCreditAccountId = num;
      lsCreditAccountId = num;
    }
  }

  let resolvedTaxCategoryId: number | null = null;
  let lsTaxCategoryId: number | null = null;
  const rawTaxCategoryId = payload.tax_category_id ?? payload.taxCategoryId ?? payload.taxCategoryID;
  if (rawTaxCategoryId !== undefined && rawTaxCategoryId !== null && rawTaxCategoryId !== '') {
    const num = Number(rawTaxCategoryId);
    let tc = !isNaN(num) ? await TaxCategory.findByPk(num) : null;
    if (!tc) {
      tc = await TaxCategory.findOne({
        where: { lightspeed_tax_category_id: String(rawTaxCategoryId) },
      });
    }
    if (tc) {
      resolvedTaxCategoryId = tc.id;
      lsTaxCategoryId = tc.lightspeed_tax_category_id
        ? parseInt(tc.lightspeed_tax_category_id, 10) || 0
        : 0;
    } else if (!isNaN(num)) {
      resolvedTaxCategoryId = num;
      lsTaxCategoryId = num;
    }
  }

  let resolvedDiscountId: number | null = null;
  let lsDiscountId: number | null = null;
  const rawDiscountId = payload.discount_id ?? payload.discountId ?? payload.discountID;
  if (rawDiscountId !== undefined && rawDiscountId !== null && rawDiscountId !== '') {
    const num = Number(rawDiscountId);
    let disc = !isNaN(num) ? await Discount.findByPk(num) : null;
    if (!disc) {
      disc = await Discount.findOne({
        where: { lightspeed_discount_id: String(rawDiscountId) },
      });
    }
    if (disc) {
      resolvedDiscountId = disc.id;
      lsDiscountId = disc.lightspeed_discount_id
        ? parseInt(disc.lightspeed_discount_id, 10) || 0
        : 0;
    } else if (!isNaN(num)) {
      resolvedDiscountId = num;
      lsDiscountId = num;
    }
  }

  return {
    resolvedCustomerTypeId,
    lsCustomerTypeId,
    resolvedCreditAccountId,
    lsCreditAccountId,
    resolvedTaxCategoryId,
    lsTaxCategoryId,
    resolvedDiscountId,
    lsDiscountId,
  };
}

/**
 * Parses customer tags from various input formats:
 * - comma-separated string: "Landscape, Commercial, VIP"
 * - string array: ["Landscape", "Commercial", "VIP"]
 * - object array: [{ tag: "VIP" }] or [{ name: "VIP" }]
 * - object: { tag: "VIP" } or { tag: ["VIP"] }
 */
function parseCustomerTags(input: any): string[] {
  if (!input) return [];
  if (typeof input === 'string') {
    return input.split(',').map((t) => t.trim()).filter(Boolean);
  }
  if (Array.isArray(input)) {
    const list: string[] = [];
    for (const item of input) {
      if (typeof item === 'string' && item.trim()) {
        list.push(item.trim());
      } else if (typeof item === 'object' && item !== null) {
        const val = item.name || item.tag;
        if (typeof val === 'string' && val.trim()) {
          list.push(val.trim());
        }
      }
    }
    return list;
  }
  if (typeof input === 'object' && input !== null) {
    if (typeof input.tag === 'string' && input.tag.trim()) {
      return [input.tag.trim()];
    }
    if (Array.isArray(input.tag)) {
      return input.tag
        .map((t: any) => (typeof t === 'string' ? t.trim() : (t?.name || t?.tag || '')))
        .filter(Boolean);
    }
  }
  return [];
}

/**
 * Formats tags for Lightspeed POS Customer payload:
 * In Lightspeed Retail R-Series:
 * - 1 tag: { tag: "VIP" }
 * - >1 tags: [{ tag: "Landscape" }, { tag: "Commercial" }, { tag: "VIP" }]
 * (Note: Sending { tag: ["tag1", "tag2"] } fails with 400 InvalidArgumentException: JSON structure is invalid).
 */
function formatLightspeedTags(tagList: string[]): any {
  if (tagList.length === 1) {
    return { tag: tagList[0] };
  }
  if (tagList.length > 1) {
    return tagList.map((t) => ({ tag: t }));
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// 1. GET /customer — Paginated customer list (searchable, filterable)
// ---------------------------------------------------------------------------
export const getCustomers = async (req: Request, res: Response) => {
  try {
    const search = (req.query.search as string) || '';
    const sort = (req.query.sort as string) === 'asc' ? 'ASC' : 'DESC';
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Number(req.query.limit) || 15);
    const offset = (page - 1) * limit;

    const customerTypeId = req.query.customerTypeId ? Number(req.query.customerTypeId) : undefined;
    const creditAccountId = req.query.creditAccountId ? Number(req.query.creditAccountId) : undefined;
    const taxCategoryId = req.query.taxCategoryId ? Number(req.query.taxCategoryId) : undefined;
    const discountId = req.query.discountId ? Number(req.query.discountId) : undefined;
    const archivedParam = req.query.archived as string;
    const archived = archivedParam === 'true' ? true : archivedParam === 'false' ? false : undefined;

    const where: any = {};

    if (customerTypeId && !isNaN(customerTypeId)) {
      where.customer_type_id = customerTypeId;
    }
    if (creditAccountId && !isNaN(creditAccountId)) {
      where.credit_account_id = creditAccountId;
    }
    if (taxCategoryId && !isNaN(taxCategoryId)) {
      where.tax_category_id = taxCategoryId;
    }
    if (discountId && !isNaN(discountId)) {
      where.discount_id = discountId;
    }

    if (search) {
      where[Op.or] = [
        { first_name: { [Op.iLike]: `%${search}%` } },
        { last_name: { [Op.iLike]: `%${search}%` } },
        { email_primary: { [Op.iLike]: `%${search}%` } },
        { email_secondary: { [Op.iLike]: `%${search}%` } },
        { company: { [Op.iLike]: `%${search}%` } },
        { phone_mobile: { [Op.iLike]: `%${search}%` } },
        { phone_home: { [Op.iLike]: `%${search}%` } },
        { phone_work: { [Op.iLike]: `%${search}%` } },
        { phone_pager: { [Op.iLike]: `%${search}%` } },
        { phone_fax: { [Op.iLike]: `%${search}%` } },
        { title: { [Op.iLike]: `%${search}%` } },
        { custom: { [Op.iLike]: `%${search}%` } },
        sequelize.where(sequelize.cast(sequelize.col('Customer.tags'), 'text'), {
          [Op.iLike]: `%${search}%`,
        }),
      ];
    }

    if (archived !== undefined) {
      where.archived = archived;
    }

    const queryOptions: any = {
      where,
      order: [['id', sort]],
      include: [
        { model: CustomerType, as: 'customerType', required: false },
        { model: CreditAccount, as: 'creditAccount', required: false },
        { model: TaxCategory, as: 'taxCategory', required: false },
        { model: Discount, as: 'discount', required: false },
      ],
      offset,
      limit,
      distinct: true,
    };

    const { count, rows } = await Customer.findAndCountAll(queryOptions);
    const formattedRows = rows.map((r: any) => formatCustomer(r));
    return res.sendPaginationSuccess(res, formattedRows, count);
  } catch (error: unknown) {
    console.error(error);
    return res.sendError(res, (error as Error).message || 'ERR_INTERNAL_SERVER_ERROR');
  }
};

// ---------------------------------------------------------------------------
// 2. GET /customer/:id — Single customer detail
// ---------------------------------------------------------------------------
export const getCustomer = async (req: Request, res: Response) => {
  try {
    const rawId = req.params.id;
    const id = Number(rawId);
    let customer: Customer | null = null;

    if (!isNaN(id)) {
      customer = await Customer.findByPk(id, {
        include: [
          { model: CustomerType, as: 'customerType', required: false },
          { model: CreditAccount, as: 'creditAccount', required: false },
          { model: TaxCategory, as: 'taxCategory', required: false },
          { model: Discount, as: 'discount', required: false },
        ],
      });
    }

    if (!customer) {
      customer = await Customer.findOne({
        where: { lightspeed_customer_id: String(rawId) },
        include: [
          { model: CustomerType, as: 'customerType', required: false },
          { model: CreditAccount, as: 'creditAccount', required: false },
          { model: TaxCategory, as: 'taxCategory', required: false },
          { model: Discount, as: 'discount', required: false },
        ],
      });
    }

    if (!customer) {
      if (isNaN(id)) {
        return res.sendError(res, 'Invalid customer ID.');
      }
      return res.sendError(res, 'Customer not found.');
    }

    return res.sendSuccess(res, formatCustomer(customer));
  } catch (error: unknown) {
    console.error(error);
    return res.sendError(res, (error as Error).message || 'ERR_INTERNAL_SERVER_ERROR');
  }
};

// ---------------------------------------------------------------------------
// 3. POST /customer — Create customer (maps to POST /Customer.json)
// ---------------------------------------------------------------------------
export const createCustomer = async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const contactObj = body.Contact || {};
    const addressesObj = contactObj.Addresses?.ContactAddress || {};
    const phonesObj = contactObj.Phones?.ContactPhone || contactObj.Phones || [];
    const phonesList: any[] = Array.isArray(phonesObj) ? phonesObj : [phonesObj].filter(Boolean);
    const emailsObj = contactObj.Emails?.ContactEmail || contactObj.Emails || [];
    const emailsList: any[] = Array.isArray(emailsObj) ? emailsObj : [emailsObj].filter(Boolean);
    const websitesObj = contactObj.Websites?.ContactWebsite || contactObj.Websites || [];
    const websitesList: any[] = Array.isArray(websitesObj) ? websitesObj : [websitesObj].filter(Boolean);
    const noteObj = body.Note || {};

    // Biographical details
    const firstName = String(body.first_name || body.firstName || '').trim();
    const lastName = String(body.last_name || body.lastName || '').trim();
    const title = body.title !== undefined ? String(body.title) : null;
    const company = body.company !== undefined ? String(body.company) : null;
    const companyRegistrationNumber =
      body.company_registration_number ?? body.companyRegistrationNumber ?? null;
    const vatNumber = body.vat_number ?? body.vatNumber ?? null;
    const dob = body.dob ?? body.birth_date ?? body.birthDate ?? null;

    // Address details
    const address1 = body.address_1 ?? body.address1 ?? body.address ?? addressesObj.address1 ?? null;
    const address2 = body.address_2 ?? body.address2 ?? addressesObj.address2 ?? null;
    const city = body.city ?? addressesObj.city ?? null;
    const state = body.state ?? body.province ?? addressesObj.state ?? null;
    const stateCode = body.state_code ?? body.stateCode ?? addressesObj.stateCode ?? null;
    const zip = body.zip ?? body.postal_code ?? body.postalCode ?? addressesObj.zip ?? null;
    const country = body.country ?? addressesObj.country ?? null;
    const countryCode = body.country_code ?? body.countryCode ?? addressesObj.countryCode ?? null;

    // Phone details
    const phoneHome =
      body.phone_home ??
      body.phoneHome ??
      body.home ??
      phonesList.find((p) => p.useType?.toLowerCase() === 'home')?.number ??
      null;
    const phoneWork =
      body.phone_work ??
      body.phoneWork ??
      body.work ??
      phonesList.find((p) => p.useType?.toLowerCase() === 'work')?.number ??
      null;
    const phoneMobile =
      body.phone_mobile ??
      body.phoneMobile ??
      body.mobile ??
      phonesList.find((p) => p.useType?.toLowerCase() === 'mobile')?.number ??
      (phonesList[0]?.number && !phonesList[0]?.useType ? phonesList[0].number : null);
    const phonePager =
      body.phone_pager ??
      body.phonePager ??
      body.pager ??
      phonesList.find((p) => p.useType?.toLowerCase() === 'pager')?.number ??
      null;
    const phoneFax =
      body.phone_fax ??
      body.phoneFax ??
      body.fax ??
      phonesList.find((p) => p.useType?.toLowerCase() === 'fax')?.number ??
      null;

    // Email details
    const emailPrimary =
      body.email_primary ??
      body.emailPrimary ??
      body.email ??
      body.email_1 ??
      emailsList.find((e) => e.useType?.toLowerCase() === 'primary')?.address ??
      (emailsList[0]?.address && !emailsList[0]?.useType ? emailsList[0].address : null);
    const emailSecondary =
      body.email_secondary ??
      body.emailSecondary ??
      body.email_2 ??
      emailsList.find((e) => e.useType?.toLowerCase() === 'secondary')?.address ??
      null;

    // Other details
    const website =
      body.website ??
      websitesList[0]?.url ??
      (typeof contactObj.Websites === 'string' ? contactObj.Websites : null) ??
      null;
    const custom =
      body.custom !== undefined
        ? (body.custom ? String(body.custom) : null)
        : contactObj.custom !== undefined
          ? (contactObj.custom ? String(contactObj.custom) : null)
          : null;

    // Contact Preferences / Consent
    const noEmail =
      body.no_email !== undefined
        ? !!body.no_email
        : body.noEmail !== undefined
          ? !!body.noEmail
          : contactObj.noEmail !== undefined
            ? contactObj.noEmail === 'true' || contactObj.noEmail === true
            : false;
    const noPhone =
      body.no_phone !== undefined
        ? !!body.no_phone
        : body.noPhone !== undefined
          ? !!body.noPhone
          : contactObj.noPhone !== undefined
            ? contactObj.noPhone === 'true' || contactObj.noPhone === true
            : false;
    const noMail =
      body.no_mail !== undefined
        ? !!body.no_mail
        : body.noMail !== undefined
          ? !!body.noMail
          : contactObj.noMail !== undefined
            ? contactObj.noMail === 'true' || contactObj.noMail === true
            : false;

    // Notes
    const note = body.note ?? body.notes ?? noteObj.note ?? null;
    const noteIsPublic =
      body.note_is_public !== undefined
        ? !!body.note_is_public
        : body.noteIsPublic !== undefined
          ? !!body.noteIsPublic
          : noteObj.isPublic !== undefined
            ? noteObj.isPublic === 'true' || noteObj.isPublic === true
            : false;

    // Tags
    const rawTags = body.tags !== undefined ? body.tags : body.Tags;
    const resolvedTags = parseCustomerTags(rawTags);
    const tagsArray: string[] | null = resolvedTags.length > 0 ? resolvedTags : null;

    // Resolve associations (CustomerType, CreditAccount, TaxCategory, Discount)
    const {
      resolvedCustomerTypeId,
      lsCustomerTypeId,
      resolvedCreditAccountId,
      lsCreditAccountId,
      resolvedTaxCategoryId,
      lsTaxCategoryId,
      resolvedDiscountId,
      lsDiscountId,
    } = await resolveAssociations(body);

    // Build Lightspeed POS payload
    const lsPayload: any = {
      firstName,
      lastName,
    };

    if (dob) {
      lsPayload.dob = new Date(dob).toISOString();
    }
    if (title) lsPayload.title = title;
    if (company) lsPayload.company = company;
    if (companyRegistrationNumber) lsPayload.companyRegistrationNumber = companyRegistrationNumber;
    if (vatNumber) lsPayload.vatNumber = vatNumber;
    if (lsCustomerTypeId !== null && lsCustomerTypeId !== undefined) {
      lsPayload.customerTypeID = lsCustomerTypeId;
    }
    if (lsDiscountId !== null && lsDiscountId !== undefined) {
      lsPayload.discountID = lsDiscountId;
    }
    if (lsTaxCategoryId !== null && lsTaxCategoryId !== undefined) {
      lsPayload.taxCategoryID = lsTaxCategoryId;
    }
    if (lsCreditAccountId !== null && lsCreditAccountId !== undefined) {
      lsPayload.creditAccountID = lsCreditAccountId;
    }

    const contactPayload: any = {};
    if (custom) contactPayload.custom = custom;
    if (noEmail !== undefined) contactPayload.noEmail = noEmail ? 'true' : 'false';
    if (noPhone !== undefined) contactPayload.noPhone = noPhone ? 'true' : 'false';
    if (noMail !== undefined) contactPayload.noMail = noMail ? 'true' : 'false';

    if (address1 || address2 || city || state || stateCode || zip || country || countryCode) {
      contactPayload.Addresses = {
        ContactAddress: {
          address1: address1 || '',
          address2: address2 || '',
          city: city || '',
          state: state || '',
          stateCode: stateCode || '',
          zip: zip || '',
          country: country || '',
          countryCode: countryCode || '',
        },
      };
    }

    const contactPhones: any[] = [];
    if (phoneMobile) contactPhones.push({ number: String(phoneMobile), useType: 'Mobile' });
    if (phoneHome) contactPhones.push({ number: String(phoneHome), useType: 'Home' });
    if (phoneWork) contactPhones.push({ number: String(phoneWork), useType: 'Work' });
    if (phonePager) contactPhones.push({ number: String(phonePager), useType: 'Pager' });
    if (phoneFax) contactPhones.push({ number: String(phoneFax), useType: 'Fax' });
    if (contactPhones.length > 0) {
      contactPayload.Phones = { ContactPhone: contactPhones };
    }

    const contactEmails: any[] = [];
    if (emailPrimary) contactEmails.push({ address: String(emailPrimary), useType: 'Primary' });
    if (emailSecondary) contactEmails.push({ address: String(emailSecondary), useType: 'Secondary' });
    if (contactEmails.length > 0) {
      contactPayload.Emails = { ContactEmail: contactEmails };
    }

    if (website) {
      contactPayload.Websites = {
        ContactWebsite: [{ url: String(website) }],
      };
    }

    if (Object.keys(contactPayload).length > 0) {
      lsPayload.Contact = contactPayload;
    }

    if (note) {
      lsPayload.Note = {
        note: String(note),
        isPublic: noteIsPublic ? 'true' : 'false',
      };
    }

    if (resolvedTags.length > 0) {
      lsPayload.Tags = formatLightspeedTags(resolvedTags);
    }

    const isReadOnly = await LightspeedService.isReadOnlyMode();

    // ─── READ-ONLY BRANCH ──────────────────────────────────────────────────
    if (isReadOnly) {
      console.log('[READ-ONLY] Lightspeed Customer CREATE payload:\n', JSON.stringify(lsPayload, null, 2));
      logger.info(
        '[READ-ONLY] Lightspeed Customer CREATE payload (not sent): POST /Customer.json ' +
          JSON.stringify(lsPayload)
      );

      return res.sendSuccess(
        res,
        {
          message:
            'Read-only mode is active. Payload displayed in console (no writes performed to POS or Database).',
          payload: lsPayload,
        },
        200
      );
    }

    // ─── WRITE ACCESS BRANCH ───────────────────────────────────────────────
    logger.info('Sending Customer CREATE request to Lightspeed POS...');
    const response = await LightspeedService.createCustomer(lsPayload);
    const responseList = LightspeedService.extractList<any>(response, 'Customer');
    const lsCustomer = responseList[0] || response.Customer;
    if (!lsCustomer || !lsCustomer.customerID) {
      throw new Error('Invalid response received from Lightspeed Customer API.');
    }

    const lightspeedCustomerId = lsCustomer.customerID.toString();
    const contactIdToSave = lsCustomer.Contact?.contactID ? String(lsCustomer.Contact.contactID) : null;

    const customer = await Customer.create({
      first_name: firstName,
      last_name: lastName,
      dob: dob ? new Date(dob) : null,
      title: title || null,
      company: company || null,
      company_registration_number: companyRegistrationNumber || null,
      vat_number: vatNumber || null,
      customer_type_id: resolvedCustomerTypeId,
      credit_account_id: resolvedCreditAccountId,
      discount_id: resolvedDiscountId,
      tax_category_id: resolvedTaxCategoryId,
      address_1: address1 || null,
      address_2: address2 || null,
      city: city || null,
      state: state || null,
      state_code: stateCode || null,
      zip: zip || null,
      country: country || null,
      country_code: countryCode || null,
      phone_mobile: phoneMobile || null,
      phone_home: phoneHome || null,
      phone_work: phoneWork || null,
      phone_pager: phonePager || null,
      phone_fax: phoneFax || null,
      email_primary: emailPrimary || null,
      email_secondary: emailSecondary || null,
      website: website || null,
      no_email: noEmail,
      no_phone: noPhone,
      no_mail: noMail,
      note: note || null,
      note_is_public: noteIsPublic,
      tags: tagsArray,
      custom: custom || null,
      contact_id: contactIdToSave,
      archived: false,
      lightspeed_customer_id: lightspeedCustomerId,
    });

    const payloadForHash = {
      first_name: customer.first_name,
      last_name: customer.last_name,
      email_primary: customer.email_primary,
      phone_mobile: customer.phone_mobile,
      archived: customer.archived,
    };
    const hash = LightspeedService.calculateHash(payloadForHash);

    await LightspeedEntityMap.upsert({
      entity_type: 'customer',
      lightspeed_id: lightspeedCustomerId,
      local_id: customer.id,
      hash,
      last_sync: new Date(),
    });

    const reloaded = await Customer.findByPk(customer.id, {
      include: [
        { model: CustomerType, as: 'customerType', required: false },
        { model: CreditAccount, as: 'creditAccount', required: false },
        { model: TaxCategory, as: 'taxCategory', required: false },
        { model: Discount, as: 'discount', required: false },
      ],
    });

    return res.sendSuccess(
      res,
      {
        customer: formatCustomer(reloaded || customer),
        message: 'Customer created successfully in Lightspeed and local database.',
      },
      201
    );
  } catch (error: unknown) {
    console.error(error);
    return res.sendError(res, (error as Error).message || 'ERR_INTERNAL_SERVER_ERROR');
  }
};

// ---------------------------------------------------------------------------
// 4. PUT /customer/:id — Update customer (maps to PUT /Customer/{customerID}.json)
// ---------------------------------------------------------------------------
export const updateCustomer = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.sendError(res, 'Invalid customer ID.');
    }

    const customer = await Customer.findByPk(id);
    if (!customer) {
      return res.sendError(res, 'Customer not found.');
    }

    const body = req.body || {};
    const contactObj = body.Contact || {};
    const addressesObj = contactObj.Addresses?.ContactAddress || {};
    const phonesObj = contactObj.Phones?.ContactPhone || contactObj.Phones || [];
    const phonesList: any[] = Array.isArray(phonesObj) ? phonesObj : [phonesObj].filter(Boolean);
    const emailsObj = contactObj.Emails?.ContactEmail || contactObj.Emails || [];
    const emailsList: any[] = Array.isArray(emailsObj) ? emailsObj : [emailsObj].filter(Boolean);
    const websitesObj = contactObj.Websites?.ContactWebsite || contactObj.Websites || [];
    const websitesList: any[] = Array.isArray(websitesObj) ? websitesObj : [websitesObj].filter(Boolean);
    const noteObj = body.Note || {};

    // Biographical
    const newFirstName =
      body.first_name !== undefined || body.firstName !== undefined
        ? String(body.first_name || body.firstName).trim()
        : customer.first_name;
    const newLastName =
      body.last_name !== undefined || body.lastName !== undefined
        ? String(body.last_name || body.lastName).trim()
        : customer.last_name;
    const newTitle = body.title !== undefined ? (body.title ? String(body.title) : null) : customer.title;
    const newCompany =
      body.company !== undefined ? (body.company ? String(body.company) : null) : customer.company;
    const newCompanyRegistrationNumber =
      body.company_registration_number !== undefined || body.companyRegistrationNumber !== undefined
        ? body.company_registration_number ?? body.companyRegistrationNumber ?? null
        : customer.company_registration_number;
    const newVatNumber =
      body.vat_number !== undefined || body.vatNumber !== undefined
        ? body.vat_number ?? body.vatNumber ?? null
        : customer.vat_number;

    let newDob = customer.dob;
    if (body.dob !== undefined || body.birth_date !== undefined || body.birthDate !== undefined) {
      const rawDob = body.dob ?? body.birth_date ?? body.birthDate;
      newDob = rawDob ? new Date(rawDob) : null;
    }

    // Address
    const newAddress1 =
      body.address_1 ?? body.address1 ?? body.address ?? addressesObj.address1 ?? customer.address_1;
    const newAddress2 = body.address_2 ?? body.address2 ?? addressesObj.address2 ?? customer.address_2;
    const newCity = body.city ?? addressesObj.city ?? customer.city;
    const newState = body.state ?? body.province ?? addressesObj.state ?? customer.state;
    const newStateCode = body.state_code ?? body.stateCode ?? addressesObj.stateCode ?? customer.state_code;
    const newZip = body.zip ?? body.postal_code ?? body.postalCode ?? addressesObj.zip ?? customer.zip;
    const newCountry = body.country ?? addressesObj.country ?? customer.country;
    const newCountryCode =
      body.country_code ?? body.countryCode ?? addressesObj.countryCode ?? customer.country_code;

    // Phone
    const newPhoneHome =
      body.phone_home ??
      body.phoneHome ??
      body.home ??
      phonesList.find((p) => p.useType?.toLowerCase() === 'home')?.number ??
      customer.phone_home;
    const newPhoneWork =
      body.phone_work ??
      body.phoneWork ??
      body.work ??
      phonesList.find((p) => p.useType?.toLowerCase() === 'work')?.number ??
      customer.phone_work;
    const newPhoneMobile =
      body.phone_mobile ??
      body.phoneMobile ??
      body.mobile ??
      phonesList.find((p) => p.useType?.toLowerCase() === 'mobile')?.number ??
      customer.phone_mobile;
    const newPhonePager =
      body.phone_pager ??
      body.phonePager ??
      body.pager ??
      phonesList.find((p) => p.useType?.toLowerCase() === 'pager')?.number ??
      customer.phone_pager;
    const newPhoneFax =
      body.phone_fax ??
      body.phoneFax ??
      body.fax ??
      phonesList.find((p) => p.useType?.toLowerCase() === 'fax')?.number ??
      customer.phone_fax;

    // Email
    const newEmailPrimary =
      body.email_primary ??
      body.emailPrimary ??
      body.email ??
      body.email_1 ??
      emailsList.find((e) => e.useType?.toLowerCase() === 'primary')?.address ??
      customer.email_primary;
    const newEmailSecondary =
      body.email_secondary ??
      body.emailSecondary ??
      body.email_2 ??
      emailsList.find((e) => e.useType?.toLowerCase() === 'secondary')?.address ??
      customer.email_secondary;

    // Other
    const newWebsite =
      body.website ??
      websitesList[0]?.url ??
      (typeof contactObj.Websites === 'string' ? contactObj.Websites : null) ??
      customer.website;
    const newCustom =
      body.custom !== undefined
        ? (body.custom ? String(body.custom) : null)
        : contactObj.custom !== undefined
          ? (contactObj.custom ? String(contactObj.custom) : null)
          : customer.custom;

    // Consent
    const newNoEmail =
      body.no_email !== undefined
        ? !!body.no_email
        : body.noEmail !== undefined
          ? !!body.noEmail
          : contactObj.noEmail !== undefined
            ? contactObj.noEmail === 'true' || contactObj.noEmail === true
            : customer.no_email;
    const newNoPhone =
      body.no_phone !== undefined
        ? !!body.no_phone
        : body.noPhone !== undefined
          ? !!body.noPhone
          : contactObj.noPhone !== undefined
            ? contactObj.noPhone === 'true' || contactObj.noPhone === true
            : customer.no_phone;
    const newNoMail =
      body.no_mail !== undefined
        ? !!body.no_mail
        : body.noMail !== undefined
          ? !!body.noMail
          : contactObj.noMail !== undefined
            ? contactObj.noMail === 'true' || contactObj.noMail === true
            : customer.no_mail;

    // Notes
    const newNote = body.note ?? body.notes ?? noteObj.note ?? customer.note;
    const newNoteIsPublic =
      body.note_is_public !== undefined
        ? !!body.note_is_public
        : body.noteIsPublic !== undefined
          ? !!body.noteIsPublic
          : noteObj.isPublic !== undefined
            ? noteObj.isPublic === 'true' || noteObj.isPublic === true
            : customer.note_is_public;

    // Tags
    let newTags: string[] | null = customer.tags;
    let resolvedNewTags: string[] | undefined = undefined;
    const rawNewTags = body.tags !== undefined ? body.tags : body.Tags;
    if (rawNewTags !== undefined) {
      resolvedNewTags = parseCustomerTags(rawNewTags);
      newTags = resolvedNewTags.length > 0 ? resolvedNewTags : null;
    }

    // Archived
    const newArchived = body.archived !== undefined ? !!body.archived : customer.archived;

    // Associations
    const {
      resolvedCustomerTypeId,
      lsCustomerTypeId,
      resolvedCreditAccountId,
      lsCreditAccountId,
      resolvedTaxCategoryId,
      lsTaxCategoryId,
      resolvedDiscountId,
      lsDiscountId,
    } = await resolveAssociations(body);

    const finalCustomerTypeId =
      resolvedCustomerTypeId !== null ? resolvedCustomerTypeId : customer.customer_type_id;
    const finalCreditAccountId =
      resolvedCreditAccountId !== null ? resolvedCreditAccountId : customer.credit_account_id;
    const finalTaxCategoryId =
      resolvedTaxCategoryId !== null ? resolvedTaxCategoryId : customer.tax_category_id;
    const finalDiscountId =
      resolvedDiscountId !== null ? resolvedDiscountId : customer.discount_id;

    // Build update payload for Lightspeed POS
    const lsPayload: any = {
      firstName: newFirstName,
      lastName: newLastName,
    };

    if (newDob) {
      lsPayload.dob = new Date(newDob).toISOString();
    }
    if (newTitle !== undefined) lsPayload.title = newTitle || '';
    if (newCompany !== undefined) lsPayload.company = newCompany || '';
    if (newCompanyRegistrationNumber !== undefined) {
      lsPayload.companyRegistrationNumber = newCompanyRegistrationNumber || '';
    }
    if (newVatNumber !== undefined) lsPayload.vatNumber = newVatNumber || '';
    if (lsCustomerTypeId !== null && lsCustomerTypeId !== undefined) {
      lsPayload.customerTypeID = lsCustomerTypeId;
    }
    if (lsDiscountId !== null && lsDiscountId !== undefined) {
      lsPayload.discountID = lsDiscountId;
    }
    if (lsTaxCategoryId !== null && lsTaxCategoryId !== undefined) {
      lsPayload.taxCategoryID = lsTaxCategoryId;
    }
    if (lsCreditAccountId !== null && lsCreditAccountId !== undefined) {
      lsPayload.creditAccountID = lsCreditAccountId;
    }
    lsPayload.archived = newArchived ? 'true' : 'false';

    const contactPayload: any = {};
    if (newCustom !== undefined && newCustom !== null) contactPayload.custom = newCustom;
    contactPayload.noEmail = newNoEmail ? 'true' : 'false';
    contactPayload.noPhone = newNoPhone ? 'true' : 'false';
    contactPayload.noMail = newNoMail ? 'true' : 'false';

    contactPayload.Addresses = {
      ContactAddress: {
        address1: newAddress1 || '',
        address2: newAddress2 || '',
        city: newCity || '',
        state: newState || '',
        stateCode: newStateCode || '',
        zip: newZip || '',
        country: newCountry || '',
        countryCode: newCountryCode || '',
      },
    };

    const contactPhones: any[] = [];
    if (newPhoneMobile) contactPhones.push({ number: String(newPhoneMobile), useType: 'Mobile' });
    if (newPhoneHome) contactPhones.push({ number: String(newPhoneHome), useType: 'Home' });
    if (newPhoneWork) contactPhones.push({ number: String(newPhoneWork), useType: 'Work' });
    if (newPhonePager) contactPhones.push({ number: String(newPhonePager), useType: 'Pager' });
    if (newPhoneFax) contactPhones.push({ number: String(newPhoneFax), useType: 'Fax' });
    if (contactPhones.length > 0) {
      contactPayload.Phones = { ContactPhone: contactPhones };
    }

    const contactEmails: any[] = [];
    if (newEmailPrimary) contactEmails.push({ address: String(newEmailPrimary), useType: 'Primary' });
    if (newEmailSecondary) contactEmails.push({ address: String(newEmailSecondary), useType: 'Secondary' });
    if (contactEmails.length > 0) {
      contactPayload.Emails = { ContactEmail: contactEmails };
    }

    if (newWebsite) {
      contactPayload.Websites = {
        ContactWebsite: [{ url: String(newWebsite) }],
      };
    }

    lsPayload.Contact = contactPayload;

    if (newNote) {
      lsPayload.Note = {
        note: String(newNote),
        isPublic: newNoteIsPublic ? 'true' : 'false',
      };
    }

    if (resolvedNewTags && resolvedNewTags.length > 0) {
      lsPayload.Tags = formatLightspeedTags(resolvedNewTags);
    }

    const isReadOnly = await LightspeedService.isReadOnlyMode();

    // ─── READ-ONLY BRANCH ──────────────────────────────────────────────────
    if (isReadOnly) {
      console.log(
        `[READ-ONLY] Lightspeed Customer UPDATE payload for customer ID ${customer.lightspeed_customer_id}:\n`,
        JSON.stringify(lsPayload, null, 2)
      );
      logger.info(
        `[READ-ONLY] Lightspeed Customer UPDATE payload (not sent): PUT /Customer/${customer.lightspeed_customer_id}.json ` +
          JSON.stringify(lsPayload)
      );

      return res.sendSuccess(res, {
        message:
          'Read-only mode is active. Payload displayed in console (no writes performed to POS or Database).',
        payload: lsPayload,
      });
    }

    // ─── WRITE ACCESS BRANCH ───────────────────────────────────────────────
    let lightspeedCustomerId = customer.lightspeed_customer_id;
    let contactIdToSave = customer.contact_id;
    if (!lightspeedCustomerId || lightspeedCustomerId.startsWith('local_') || lightspeedCustomerId.startsWith('mock-')) {
      logger.info('Customer has local ID only. Creating in Lightspeed POS with payload:', lsPayload);
      const response = await LightspeedService.createCustomer(lsPayload);
      const responseList = LightspeedService.extractList<any>(response, 'Customer');
      const lsCustomer = responseList[0] || response.Customer;
      if (!lsCustomer || !lsCustomer.customerID) {
        throw new Error('Invalid response received from Lightspeed Customer API.');
      }
      lightspeedCustomerId = lsCustomer.customerID.toString();
      if (lsCustomer.Contact?.contactID) {
        contactIdToSave = String(lsCustomer.Contact.contactID);
      }
    } else {
      logger.info(`Updating customer ${lightspeedCustomerId} in Lightspeed POS with payload:`, lsPayload);
      const response = await LightspeedService.updateCustomer(lightspeedCustomerId, lsPayload);
      const responseList = LightspeedService.extractList<any>(response, 'Customer');
      const lsCustomer = responseList[0] || response.Customer;
      if (lsCustomer?.Contact?.contactID) {
        contactIdToSave = String(lsCustomer.Contact.contactID);
      }
    }

    // Persist locally in Database
    await customer.update({
      lightspeed_customer_id: lightspeedCustomerId,
      contact_id: contactIdToSave,
      first_name: newFirstName,
      last_name: newLastName,
      title: newTitle,
      company: newCompany,
      company_registration_number: newCompanyRegistrationNumber,
      vat_number: newVatNumber,
      dob: newDob,
      address_1: newAddress1,
      address_2: newAddress2,
      city: newCity,
      state: newState,
      state_code: newStateCode,
      zip: newZip,
      country: newCountry,
      country_code: newCountryCode,
      phone_mobile: newPhoneMobile,
      phone_home: newPhoneHome,
      phone_work: newPhoneWork,
      phone_pager: newPhonePager,
      phone_fax: newPhoneFax,
      email_primary: newEmailPrimary,
      email_secondary: newEmailSecondary,
      website: newWebsite,
      custom: newCustom,
      no_email: newNoEmail,
      no_phone: newNoPhone,
      no_mail: newNoMail,
      note: newNote,
      note_is_public: newNoteIsPublic,
      tags: newTags,
      archived: newArchived,
      customer_type_id: finalCustomerTypeId,
      credit_account_id: finalCreditAccountId,
      tax_category_id: finalTaxCategoryId,
      discount_id: finalDiscountId,
    });

    const payloadForHash = {
      first_name: customer.first_name,
      last_name: customer.last_name,
      email_primary: customer.email_primary,
      phone_mobile: customer.phone_mobile,
      archived: customer.archived,
    };
    const hash = LightspeedService.calculateHash(payloadForHash);

    if (lightspeedCustomerId) {
      await LightspeedEntityMap.upsert({
        entity_type: 'customer',
        lightspeed_id: lightspeedCustomerId,
        local_id: customer.id,
        hash,
        last_sync: new Date(),
      });
    }

    const reloaded = await Customer.findByPk(customer.id, {
      include: [
        { model: CustomerType, as: 'customerType', required: false },
        { model: CreditAccount, as: 'creditAccount', required: false },
        { model: TaxCategory, as: 'taxCategory', required: false },
        { model: Discount, as: 'discount', required: false },
      ],
    });

    return res.sendSuccess(res, {
      customer: formatCustomer(reloaded || customer),
      message: 'Customer updated successfully in Lightspeed and local database.',
    });
  } catch (error: unknown) {
    console.error(error);
    return res.sendError(res, (error as Error).message || 'ERR_INTERNAL_SERVER_ERROR');
  }
};

// ---------------------------------------------------------------------------
// 5. DELETE /customer/:id — Archive customer locally and in Lightspeed
// ---------------------------------------------------------------------------
export const deleteCustomer = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.sendError(res, 'Invalid customer ID.');
    }

    const customer = await Customer.findByPk(id);
    if (!customer) {
      return res.sendError(res, 'Customer not found.');
    }

    const lightspeedCustomerId = customer.lightspeed_customer_id;

    const isReadOnly = await LightspeedService.isReadOnlyMode();

    // ─── READ-ONLY BRANCH ──────────────────────────────────────────────────
    if (isReadOnly) {
      console.log(
        `[READ-ONLY] Lightspeed Customer DELETE payload for customer ID ${lightspeedCustomerId}: DELETE /Customer/${lightspeedCustomerId}.json`
      );
      logger.info(
        `[READ-ONLY] Lightspeed Customer DELETE payload (not sent): DELETE /Customer/${lightspeedCustomerId}.json`
      );

      return res.sendSuccess(res, {
        message:
          'Read-only mode is active. Delete payload displayed in console (no writes performed to POS or Database).',
        customerID: lightspeedCustomerId,
      });
    }

    // ─── WRITE ACCESS BRANCH ───────────────────────────────────────────────
    if (
      lightspeedCustomerId &&
      !lightspeedCustomerId.startsWith('local_') &&
      !lightspeedCustomerId.startsWith('mock-')
    ) {
      logger.info(`Archiving customer ${lightspeedCustomerId} in Lightspeed POS via DELETE...`);
      await LightspeedService.deleteCustomer(lightspeedCustomerId);
    }

    await customer.update({ archived: true });

    return res.sendSuccess(res, {
      customer: formatCustomer(customer),
      message: 'Customer archived successfully in Lightspeed and local database.',
    });
  } catch (error: unknown) {
    console.error(error);
    return res.sendError(res, (error as Error).message || 'ERR_INTERNAL_SERVER_ERROR');
  }
};

export default {
  getCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  deleteCustomer,
};
