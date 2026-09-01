import { Request, Response } from 'express';
import { Op } from 'sequelize';
import { Vendor, LightspeedEntityMap } from '@/database/models';
import { LightspeedService } from '@/services/lightspeed';
import logger from '@/utils/logger';

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Formats a Vendor instance to include all the exact fields that are there in
 * Lightspeed (both camelCase and original database keys) so that the admin
 * panel receives a payload perfectly synced with the Lightspeed Vendor schema.
 */
function formatVendor(vendorObj: any) {
  if (!vendorObj) return null;
  const json = vendorObj.toJSON ? vendorObj.toJSON() : vendorObj;

  const phoneList: any[] = [];
  if (json.phone) phoneList.push({ number: json.phone, useType: 'Work' });
  if (json.phone_mobile) phoneList.push({ number: json.phone_mobile, useType: 'Mobile' });
  if (json.phone_fax) phoneList.push({ number: json.phone_fax, useType: 'Fax' });

  const emailList: any[] = [];
  if (json.email) emailList.push({ address: json.email, useType: 'Primary' });
  if (json.email_secondary) emailList.push({ address: json.email_secondary, useType: 'Secondary' });

  return {
    ...json,
    // Exact Lightspeed API fields
    vendorID: parseInt(json.lightspeed_vendor_id, 10) || 0,
    name: json.name,
    archived: !!json.archived,
    accountNumber: json.account_number || '',
    priceLevel: json.price_level || '',
    updatePrice: !!json.update_price,
    updateCost: !!json.update_cost,
    updateDescription: !!json.update_description,
    shareSellThrough: !!json.share_sell_through,
    b2bSellerUID: json.b2b_seller_uid || '',
    purchasingCurrency: json.purchasing_currency_code 
      ? {
          code: json.purchasing_currency_code,
          symbol: json.purchasing_currency_symbol || '',
          rate: String(json.purchasing_currency_rate || '1'),
        }
      : null,
    Reps: json.rep_first_name 
      ? {
          VendorRep: {
            firstName: json.rep_first_name,
            lastName: json.rep_last_name || '',
          }
        }
      : null,
    Contact: {
      contactID: json.contact_id || '',
      custom: json.custom || '',
      noEmail: json.no_email ? 'true' : 'false',
      noPhone: json.no_phone ? 'true' : 'false',
      noMail: json.no_mail ? 'true' : 'false',
      Addresses: {
        ContactAddress: {
          address1: json.address_1 || '',
          address2: json.address_2 || '',
          city: json.city || '',
          state: json.state || '',
          zip: json.zip || '',
          country: json.country || '',
          countryCode: json.country_code || '',
          stateCode: json.state_code || '',
        }
      },
      Phones: phoneList.length > 0
        ? {
            ContactPhone: phoneList.length === 1 ? phoneList[0] : phoneList,
          }
        : null,
      Emails: emailList.length > 0
        ? {
            ContactEmail: emailList.length === 1 ? emailList[0] : emailList,
          }
        : null,
      Websites: json.website || '',
    },
    createTime: json.createdAt || json.created_at || null,
    timeStamp: json.updatedAt || json.updated_at || null,
  };
}

// ---------------------------------------------------------------------------
// 1. GET /vendor — Paginated flat list (maps to GET /Vendor.json)
// ---------------------------------------------------------------------------

export const getVendors = async (req: Request, res: Response) => {
  try {
    const search = (req.query.search as string) || '';
    const sort   = (req.query.sort as string) === 'asc' ? 'ASC' : 'DESC';
    const archived   = (req.query.archived as string) === 'true' ? true : (req.query.archived as string) === 'false' ? false : undefined;
    const page   = Math.max(1, Number(req.query.page) || 1);
    const limit  = Math.max(1, Number(req.query.limit) || 15);
    const offset = (page - 1) * limit;

    const where: any = {};

    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { lightspeed_vendor_id: { [Op.iLike]: `%${search}%` } },
      ];
    }

    if (archived !== undefined) {
      where.archived = archived;
    }

    const queryOptions: any = {
      where,
      order: [['name', sort]],
    };

    if (req.query.pagination === 'true') {
      const { count, rows } = await Vendor.findAndCountAll({
        ...queryOptions,
        offset,
        limit,
        distinct: true,
      });
      const formattedRows = rows.map((r: any) => formatVendor(r));
      return res.sendPaginationSuccess(res, formattedRows, count);
    }

    const vendors = await Vendor.findAll(queryOptions);
    const formattedVendors = vendors.map((v: any) => formatVendor(v));
    return res.sendSuccess(res, formattedVendors);
  } catch (error: unknown) {
    console.error(error);
    return res.sendError(res, (error as Error).message || 'ERR_INTERNAL_SERVER_ERROR');
  }
};

// ---------------------------------------------------------------------------
// 2. GET /vendor/:id — Single vendor detail (maps to GET /Vendor/{vendorID}.json)
// ---------------------------------------------------------------------------

export const getVendor = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.sendError(res, 'Invalid vendor ID.');
    }

    const vendor = await Vendor.findByPk(id);
    if (!vendor) {
      return res.sendError(res, 'Vendor not found.');
    }

    // Retrieve Lightspeed sync metadata from the entity map
    const syncInfo = await LightspeedEntityMap.findOne({
      where: {
        entity_type: 'vendor',
        lightspeed_id: vendor.lightspeed_vendor_id,
      },
    });

    return res.sendSuccess(res, {
      ...formatVendor(vendor),
      lightspeed_sync_info: syncInfo
        ? {
            entity_map_id:  syncInfo.id,
            lightspeed_id:  syncInfo.lightspeed_id,
            local_id:       syncInfo.local_id,
            last_sync:      syncInfo.last_sync,
            hash:           syncInfo.hash,
          }
        : null,
    });
  } catch (error: unknown) {
    console.error(error);
    return res.sendError(res, (error as Error).message || 'ERR_INTERNAL_SERVER_ERROR');
  }
};

// ---------------------------------------------------------------------------
// 3. POST /vendor — Create vendor locally (maps to POST /Vendor.json)
// ---------------------------------------------------------------------------

export const createVendor = async (req: Request, res: Response) => {
  try {
    const {
      name,
      accountNumber,
      priceLevel,
      updatePrice,
      updateCost,
      updateDescription,
      shareSellThrough,
      b2bSellerUID,
      purchasingCurrency,
      Reps
    } = req.body as {
      name?: unknown;
      accountNumber?: unknown;
      priceLevel?: unknown;
      updatePrice?: unknown;
      updateCost?: unknown;
      updateDescription?: unknown;
      shareSellThrough?: unknown;
      b2bSellerUID?: unknown;
      purchasingCurrency?: { code?: string; symbol?: string; rate?: string };
      Reps?: { VendorRep?: { firstName?: string; lastName?: string } };
    };

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return res.sendError(res, 'Vendor name is required.');
    }

    const trimmedName = name.trim();

    // Check duplicate local name
    const existing = await Vendor.findOne({ where: { name: trimmedName } });
    if (existing) {
      return res.sendError(res, `Vendor with name '${trimmedName}' already exists.`);
    }

    // Extract Contact details from body or Contact object
    const contactObj = (req.body as any).Contact || {};
    const addressObj = contactObj.Addresses?.ContactAddress || {};

    const address_1 = (req.body as any).address_1 !== undefined ? String((req.body as any).address_1) : (addressObj.address1 ? String(addressObj.address1) : '');
    const address_2 = (req.body as any).address_2 !== undefined ? String((req.body as any).address_2) : (addressObj.address2 ? String(addressObj.address2) : '');
    const city = (req.body as any).city !== undefined ? String((req.body as any).city) : (addressObj.city ? String(addressObj.city) : '');
    const state = (req.body as any).state !== undefined ? String((req.body as any).state) : (addressObj.state ? String(addressObj.state) : '');
    const state_code = (req.body as any).state_code !== undefined ? String((req.body as any).state_code) : (addressObj.stateCode ? String(addressObj.stateCode) : '');
    const zip = (req.body as any).zip !== undefined ? String((req.body as any).zip) : (addressObj.zip ? String(addressObj.zip) : '');
    const country = (req.body as any).country !== undefined ? String((req.body as any).country) : (addressObj.country ? String(addressObj.country) : '');
    const country_code = (req.body as any).country_code !== undefined ? String((req.body as any).country_code) : (addressObj.countryCode ? String(addressObj.countryCode) : '');

    const website = (req.body as any).website !== undefined ? String((req.body as any).website) : (contactObj.Websites ? String(contactObj.Websites) : '');

    // Extract Reps
    let repFirstName = Reps && Reps.VendorRep ? Reps.VendorRep.firstName || null : null;
    let repLastName = Reps && Reps.VendorRep ? Reps.VendorRep.lastName || null : null;
    if (!repFirstName && (req.body as any).rep_first_name) {
      repFirstName = String((req.body as any).rep_first_name);
    }
    if (!repLastName && (req.body as any).rep_last_name) {
      repLastName = String((req.body as any).rep_last_name);
    }

    const repPayload = (repFirstName || repLastName)
      ? {
          VendorRep: {
            firstName: repFirstName || '',
            lastName: repLastName || '',
          },
        }
      : null;

    const contactPayload: any = {};
    const hasAddress = Boolean(address_1 || address_2 || city || state || zip || country || country_code || state_code);
    if (hasAddress) {
      contactPayload.Addresses = {
        ContactAddress: {
          address1: address_1 || '',
          address2: address_2 || '',
          city: city || '',
          state: state || '',
          zip: zip || '',
          country: country || '',
          countryCode: country_code || '',
          stateCode: state_code || '',
        },
      };
    }

    // Collect Phones (Work, Mobile, Fax)
    const phonesList: Array<{ number: string; useType: string }> = [];
    if (contactObj.Phones && contactObj.Phones.ContactPhone) {
      const rawPhones = Array.isArray(contactObj.Phones.ContactPhone)
        ? contactObj.Phones.ContactPhone
        : [contactObj.Phones.ContactPhone];
      for (const p of rawPhones) {
        if (p && p.number) {
          phonesList.push({
            number: String(p.number).trim(),
            useType: p.useType || 'Work',
          });
        }
      }
    }

    const workPhone = (req.body as any).phone || (req.body as any).phone_work || (req.body as any).workPhone;
    if (workPhone && !phonesList.some(p => p.useType.toLowerCase() === 'work')) {
      phonesList.push({ number: String(workPhone).trim(), useType: 'Work' });
    }

    const mobilePhone = (req.body as any).mobile || (req.body as any).phone_mobile || (req.body as any).mobilePhone;
    if (mobilePhone && !phonesList.some(p => p.useType.toLowerCase() === 'mobile')) {
      phonesList.push({ number: String(mobilePhone).trim(), useType: 'Mobile' });
    }

    const faxPhone = (req.body as any).fax || (req.body as any).phone_fax || (req.body as any).faxPhone;
    if (faxPhone && !phonesList.some(p => p.useType.toLowerCase() === 'fax')) {
      phonesList.push({ number: String(faxPhone).trim(), useType: 'Fax' });
    }

    if (phonesList.length === 1) {
      contactPayload.Phones = {
        ContactPhone: phonesList[0],
      };
    } else if (phonesList.length > 1) {
      contactPayload.Phones = {
        ContactPhone: phonesList,
      };
    }

    // Collect Emails (Primary, Secondary)
    const emailsList: Array<{ address: string; useType: string }> = [];
    if (contactObj.Emails && contactObj.Emails.ContactEmail) {
      const rawEmails = Array.isArray(contactObj.Emails.ContactEmail)
        ? contactObj.Emails.ContactEmail
        : [contactObj.Emails.ContactEmail];
      for (const e of rawEmails) {
        if (e && e.address) {
          emailsList.push({
            address: String(e.address).trim(),
            useType: e.useType || 'Primary',
          });
        }
      }
    }

    const primaryEmail = (req.body as any).email || (req.body as any).email_1 || (req.body as any).email1 || (req.body as any).email_primary;
    if (primaryEmail && !emailsList.some(e => e.useType.toLowerCase() === 'primary')) {
      emailsList.push({ address: String(primaryEmail).trim(), useType: 'Primary' });
    }

    const secondaryEmail = (req.body as any).email_2 || (req.body as any).email2 || (req.body as any).email_secondary;
    if (secondaryEmail && !emailsList.some(e => e.useType.toLowerCase() === 'secondary')) {
      emailsList.push({ address: String(secondaryEmail).trim(), useType: 'Secondary' });
    }

    if (emailsList.length === 1) {
      contactPayload.Emails = {
        ContactEmail: emailsList[0],
      };
    } else if (emailsList.length > 1) {
      contactPayload.Emails = {
        ContactEmail: emailsList,
      };
    }

    const custom = (req.body as any).custom !== undefined
      ? String((req.body as any).custom)
      : (contactObj.custom !== undefined ? String(contactObj.custom) : '');

    const noEmail = (req.body as any).no_email !== undefined
      ? !!(req.body as any).no_email
      : (contactObj.noEmail !== undefined ? (contactObj.noEmail === 'true' || contactObj.noEmail === true) : false);

    const noPhone = (req.body as any).no_phone !== undefined
      ? !!(req.body as any).no_phone
      : (contactObj.noPhone !== undefined ? (contactObj.noPhone === 'true' || contactObj.noPhone === true) : false);

    const noMail = (req.body as any).no_mail !== undefined
      ? !!(req.body as any).no_mail
      : (contactObj.noMail !== undefined ? (contactObj.noMail === 'true' || contactObj.noMail === true) : false);

    if (custom) {
      contactPayload.custom = custom;
    }
    if ((req.body as any).no_email !== undefined || contactObj.noEmail !== undefined) {
      contactPayload.noEmail = noEmail ? 'true' : 'false';
    }
    if ((req.body as any).no_phone !== undefined || contactObj.noPhone !== undefined) {
      contactPayload.noPhone = noPhone ? 'true' : 'false';
    }
    if ((req.body as any).no_mail !== undefined || contactObj.noMail !== undefined) {
      contactPayload.noMail = noMail ? 'true' : 'false';
    }

    if (website) {
      contactPayload.Websites = website;
    }

    const lsPayload: any = {
      name: trimmedName,
      accountNumber: accountNumber ? String(accountNumber) : '',
      priceLevel: priceLevel ? String(priceLevel) : '',
      updatePrice: updatePrice ? 'true' : 'false',
      updateCost: updateCost ? 'true' : 'false',
      updateDescription: updateDescription ? 'true' : 'false',
      shareSellThrough: shareSellThrough ? 'true' : 'false',
      b2bSellerUID: b2bSellerUID ? String(b2bSellerUID) : '',
    };

    if (Object.keys(contactPayload).length > 0) {
      lsPayload.Contact = contactPayload;
    }
    if (repPayload) {
      lsPayload.Reps = repPayload;
    }
    if (purchasingCurrency && purchasingCurrency.code) {
      lsPayload.purchasingCurrency = {
        code: purchasingCurrency.code,
        symbol: purchasingCurrency.symbol || '$',
        rate: String(purchasingCurrency.rate || '1'),
      };
    }

    const isReadOnly = await LightspeedService.isReadOnlyMode();

    // ─── READ-ONLY BRANCH ──────────────────────────────────────────────────
    // If READ Only flag is true, only show the payload in console and do not write to POS or DB.
    if (isReadOnly) {
      console.log('[READ-ONLY] Lightspeed Vendor CREATE payload:\n', JSON.stringify(lsPayload, null, 2));
      logger.info(
        '[READ-ONLY] Lightspeed Vendor CREATE payload (not sent): POST /Vendor.json ' +
          JSON.stringify(lsPayload)
      );

      return res.sendSuccess(
        res,
        {
          message: 'Read-only mode is active. Payload displayed in console (no writes performed to POS or Database).',
          payload: lsPayload,
        },
        200
      );
    }

    // ─── WRITE ACCESS BRANCH ───────────────────────────────────────────────
    // When read-only mode is disabled, proceed with write access to Lightspeed POS and local Database.
    logger.info('Sending Vendor CREATE request to Lightspeed POS...');
    const response = await LightspeedService.createVendor(lsPayload);
    const responseList = LightspeedService.extractList<any>(response, 'Vendor');
    const lsVendor = responseList[0] || response.Vendor;
    if (!lsVendor || !lsVendor.vendorID) {
      throw new Error('Invalid response received from Lightspeed Vendor API.');
    }

    const lightspeedVendorId = lsVendor.vendorID.toString();
    const contactIdToSave = lsVendor.Contact?.contactID ? String(lsVendor.Contact.contactID) : null;

    const phoneToSave = phonesList.find(p => p.useType.toLowerCase() === 'work')?.number || phonesList[0]?.number || null;
    const phoneMobileToSave = phonesList.find(p => p.useType.toLowerCase() === 'mobile')?.number || null;
    const phoneFaxToSave = phonesList.find(p => p.useType.toLowerCase() === 'fax')?.number || null;

    const emailToSave = emailsList.find(e => e.useType.toLowerCase() === 'primary')?.address || emailsList[0]?.address || null;
    const emailSecondaryToSave = emailsList.find(e => e.useType.toLowerCase() === 'secondary')?.address || null;

    // Create locally in database
    const vendor = await Vendor.create({
      name: trimmedName,
      lightspeed_vendor_id: lightspeedVendorId,
      archived: lsVendor.archived === 'true',
      account_number: accountNumber ? String(accountNumber) : '',
      price_level: priceLevel ? String(priceLevel) : '',
      update_price: !!updatePrice,
      update_cost: !!updateCost,
      update_description: !!updateDescription,
      share_sell_through: !!shareSellThrough,
      b2b_seller_uid: b2bSellerUID ? String(b2bSellerUID) : '',
      purchasing_currency_code: purchasingCurrency ? purchasingCurrency.code || null : null,
      purchasing_currency_symbol: purchasingCurrency ? purchasingCurrency.symbol || null : null,
      purchasing_currency_rate: purchasingCurrency ? parseFloat(purchasingCurrency.rate || '1') : null,
      rep_first_name: repFirstName,
      rep_last_name: repLastName,
      address_1: address_1 || null,
      address_2: address_2 || null,
      city: city || null,
      state: state || null,
      state_code: state_code || null,
      zip: zip || null,
      country: country || null,
      country_code: country_code || null,
      phone: phoneToSave,
      phone_mobile: phoneMobileToSave,
      phone_fax: phoneFaxToSave,
      email: emailToSave,
      email_secondary: emailSecondaryToSave,
      website: website || null,
      contact_id: contactIdToSave,
      custom: custom || null,
      no_email: noEmail,
      no_phone: noPhone,
      no_mail: noMail,
    });

    // Update entity mapping for change detection
    const payloadForHash = {
      name: vendor.name,
      archived: vendor.archived,
      account_number: vendor.account_number,
      price_level: vendor.price_level,
      update_price: vendor.update_price,
      update_cost: vendor.update_cost,
      update_description: vendor.update_description,
      share_sell_through: vendor.share_sell_through,
      b2b_seller_uid: vendor.b2b_seller_uid,
      purchasing_currency_code: vendor.purchasing_currency_code,
      purchasing_currency_symbol: vendor.purchasing_currency_symbol,
      purchasing_currency_rate: vendor.purchasing_currency_rate,
      rep_first_name: vendor.rep_first_name,
      rep_last_name: vendor.rep_last_name,
      address_1: vendor.address_1,
      address_2: vendor.address_2,
      city: vendor.city,
      state: vendor.state,
      state_code: vendor.state_code,
      zip: vendor.zip,
      country: vendor.country,
      country_code: vendor.country_code,
      phone: vendor.phone,
      phone_mobile: vendor.phone_mobile,
      phone_fax: vendor.phone_fax,
      email: vendor.email,
      email_secondary: vendor.email_secondary,
      website: vendor.website,
      contact_id: vendor.contact_id,
      custom: vendor.custom,
      no_email: vendor.no_email,
      no_phone: vendor.no_phone,
      no_mail: vendor.no_mail,
    };
    const hash = LightspeedService.calculateHash(payloadForHash);

    await LightspeedEntityMap.upsert({
      entity_type: 'vendor',
      lightspeed_id: lightspeedVendorId,
      local_id: vendor.id,
      hash,
      last_sync: new Date(),
    });

    return res.sendSuccess(
      res,
      {
        vendor: formatVendor(vendor),
        message: 'Vendor created successfully in Lightspeed and local database.',
      },
      201
    );
  } catch (error: unknown) {
    console.error(error);
    return res.sendError(res, (error as Error).message || 'ERR_INTERNAL_SERVER_ERROR');
  }
};

// ---------------------------------------------------------------------------
// 4. PUT /vendor/:id — Update vendor locally (maps to PUT /Vendor/{vendorID}.json)
// ---------------------------------------------------------------------------

export const updateVendor = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.sendError(res, 'Invalid vendor ID.');
    }

    const vendor = await Vendor.findByPk(id);
    if (!vendor) {
      return res.sendError(res, 'Vendor not found.');
    }

    const {
      name,
      archived,
      accountNumber,
      priceLevel,
      updatePrice,
      updateCost,
      updateDescription,
      shareSellThrough,
      b2bSellerUID,
      purchasingCurrency,
      Reps
    } = req.body as {
      name?: unknown;
      archived?: unknown;
      accountNumber?: unknown;
      priceLevel?: unknown;
      updatePrice?: unknown;
      updateCost?: unknown;
      updateDescription?: unknown;
      shareSellThrough?: unknown;
      b2bSellerUID?: unknown;
      purchasingCurrency?: { code?: string; symbol?: string; rate?: string };
      Reps?: { VendorRep?: { firstName?: string; lastName?: string } };
    };

    if (name !== undefined && (typeof name !== 'string' || name.trim() === '')) {
      return res.sendError(res, 'Vendor name cannot be empty.');
    }

    const newName = name !== undefined ? (name as string).trim() : vendor.name;
    const newArchived = archived !== undefined ? !!archived : vendor.archived;
    const newAccountNumber = accountNumber !== undefined ? String(accountNumber) : vendor.account_number;
    const newPriceLevel = priceLevel !== undefined ? String(priceLevel) : vendor.price_level;
    const newUpdatePrice = updatePrice !== undefined ? !!updatePrice : vendor.update_price;
    const newUpdateCost = updateCost !== undefined ? !!updateCost : vendor.update_cost;
    const newUpdateDescription = updateDescription !== undefined ? !!updateDescription : vendor.update_description;
    const newShareSellThrough = shareSellThrough !== undefined ? !!shareSellThrough : vendor.share_sell_through;
    const newB2bSellerUID = b2bSellerUID !== undefined ? String(b2bSellerUID) : vendor.b2b_seller_uid;

    const newCurrencyCode = purchasingCurrency !== undefined ? (purchasingCurrency ? purchasingCurrency.code || null : null) : vendor.purchasing_currency_code;
    const newCurrencySymbol = purchasingCurrency !== undefined ? (purchasingCurrency ? purchasingCurrency.symbol || null : null) : vendor.purchasing_currency_symbol;
    const newCurrencyRate = purchasingCurrency !== undefined ? (purchasingCurrency ? parseFloat(purchasingCurrency.rate || '1') : null) : vendor.purchasing_currency_rate;

    // Extract Reps
    let newRepFirstName = Reps !== undefined ? (Reps && Reps.VendorRep ? Reps.VendorRep.firstName || null : null) : vendor.rep_first_name;
    let newRepLastName = Reps !== undefined ? (Reps && Reps.VendorRep ? Reps.VendorRep.lastName || null : null) : vendor.rep_last_name;
    if (Reps === undefined) {
      if ((req.body as any).rep_first_name !== undefined) {
        newRepFirstName = (req.body as any).rep_first_name ? String((req.body as any).rep_first_name) : null;
      }
      if ((req.body as any).rep_last_name !== undefined) {
        newRepLastName = (req.body as any).rep_last_name ? String((req.body as any).rep_last_name) : null;
      }
    }

    const repPayload = (newRepFirstName || newRepLastName)
      ? {
          VendorRep: {
            firstName: newRepFirstName || '',
            lastName: newRepLastName || '',
          },
        }
      : null;

    // Contact fields
    const contactObj = (req.body as any).Contact;
    const addressObj = contactObj?.Addresses?.ContactAddress;
    const phoneObj = contactObj?.Phones?.ContactPhone;
    const emailObj = contactObj?.Emails?.ContactEmail;

    const newAddress1 = (req.body as any).address_1 !== undefined ? String((req.body as any).address_1) : (addressObj !== undefined ? (addressObj?.address1 ? String(addressObj.address1) : '') : vendor.address_1);
    const newAddress2 = (req.body as any).address_2 !== undefined ? String((req.body as any).address_2) : (addressObj !== undefined ? (addressObj?.address2 ? String(addressObj.address2) : '') : vendor.address_2);
    const newCity = (req.body as any).city !== undefined ? String((req.body as any).city) : (addressObj !== undefined ? (addressObj?.city ? String(addressObj.city) : '') : vendor.city);
    const newState = (req.body as any).state !== undefined ? String((req.body as any).state) : (addressObj !== undefined ? (addressObj?.state ? String(addressObj.state) : '') : vendor.state);
    const newStateCode = (req.body as any).state_code !== undefined ? String((req.body as any).state_code) : (addressObj !== undefined ? (addressObj?.stateCode ? String(addressObj.stateCode) : '') : vendor.state_code);
    const newZip = (req.body as any).zip !== undefined ? String((req.body as any).zip) : (addressObj !== undefined ? (addressObj?.zip ? String(addressObj.zip) : '') : vendor.zip);
    const newCountry = (req.body as any).country !== undefined ? String((req.body as any).country) : (addressObj !== undefined ? (addressObj?.country ? String(addressObj.country) : '') : vendor.country);
    const newCountryCode = (req.body as any).country_code !== undefined ? String((req.body as any).country_code) : (addressObj !== undefined ? (addressObj?.countryCode ? String(addressObj.countryCode) : '') : vendor.country_code);

    const newPhone = (req.body as any).phone !== undefined ? String((req.body as any).phone) : (phoneObj !== undefined ? (phoneObj?.number ? String(phoneObj.number) : '') : vendor.phone);
    const newEmail = (req.body as any).email !== undefined ? String((req.body as any).email) : (emailObj !== undefined ? (emailObj?.address ? String(emailObj.address) : '') : vendor.email);
    const newWebsite = (req.body as any).website !== undefined ? String((req.body as any).website) : (contactObj !== undefined ? (contactObj?.Websites ? String(contactObj.Websites) : '') : vendor.website);

    // Check duplicate local name if changed
    if (name !== undefined && newName !== vendor.name) {
      const existing = await Vendor.findOne({ where: { name: newName } });
      if (existing) {
        return res.sendError(res, `Another vendor with name '${newName}' already exists.`);
      }
    }

    const contactPayload: any = {};
    const hasAddress = Boolean(newAddress1 || newAddress2 || newCity || newState || newZip || newCountry || newCountryCode || newStateCode);
    if (hasAddress) {
      contactPayload.Addresses = {
        ContactAddress: {
          address1: newAddress1 || '',
          address2: newAddress2 || '',
          city: newCity || '',
          state: newState || '',
          zip: newZip || '',
          country: newCountry || '',
          countryCode: newCountryCode || '',
          stateCode: newStateCode || '',
        },
      };
    }
    // Collect Phones (Work, Mobile, Fax)
    const phonesList: Array<{ number: string; useType: string }> = [];
    if (contactObj?.Phones && contactObj.Phones.ContactPhone) {
      const rawPhones = Array.isArray(contactObj.Phones.ContactPhone)
        ? contactObj.Phones.ContactPhone
        : [contactObj.Phones.ContactPhone];
      for (const p of rawPhones) {
        if (p && p.number) {
          phonesList.push({
            number: String(p.number).trim(),
            useType: p.useType || 'Work',
          });
        }
      }
    }

    const workPhone = (req.body as any).phone !== undefined ? (req.body as any).phone : ((req.body as any).phone_work || (req.body as any).workPhone || newPhone);
    if (workPhone && !phonesList.some(p => p.useType.toLowerCase() === 'work')) {
      phonesList.push({ number: String(workPhone).trim(), useType: 'Work' });
    }

    const mobilePhone = (req.body as any).mobile || (req.body as any).phone_mobile || (req.body as any).mobilePhone;
    if (mobilePhone && !phonesList.some(p => p.useType.toLowerCase() === 'mobile')) {
      phonesList.push({ number: String(mobilePhone).trim(), useType: 'Mobile' });
    }

    const faxPhone = (req.body as any).fax || (req.body as any).phone_fax || (req.body as any).faxPhone;
    if (faxPhone && !phonesList.some(p => p.useType.toLowerCase() === 'fax')) {
      phonesList.push({ number: String(faxPhone).trim(), useType: 'Fax' });
    }

    if (phonesList.length === 1) {
      contactPayload.Phones = {
        ContactPhone: phonesList[0],
      };
    } else if (phonesList.length > 1) {
      contactPayload.Phones = {
        ContactPhone: phonesList,
      };
    }

    // Collect Emails (Primary, Secondary)
    const emailsList: Array<{ address: string; useType: string }> = [];
    if (contactObj?.Emails && contactObj.Emails.ContactEmail) {
      const rawEmails = Array.isArray(contactObj.Emails.ContactEmail)
        ? contactObj.Emails.ContactEmail
        : [contactObj.Emails.ContactEmail];
      for (const e of rawEmails) {
        if (e && e.address) {
          emailsList.push({
            address: String(e.address).trim(),
            useType: e.useType || 'Primary',
          });
        }
      }
    }

    const primaryEmail = (req.body as any).email !== undefined ? (req.body as any).email : ((req.body as any).email_1 || (req.body as any).email1 || (req.body as any).email_primary || newEmail);
    if (primaryEmail && !emailsList.some(e => e.useType.toLowerCase() === 'primary')) {
      emailsList.push({ address: String(primaryEmail).trim(), useType: 'Primary' });
    }

    const secondaryEmail = (req.body as any).email_2 || (req.body as any).email2 || (req.body as any).email_secondary;
    if (secondaryEmail && !emailsList.some(e => e.useType.toLowerCase() === 'secondary')) {
      emailsList.push({ address: String(secondaryEmail).trim(), useType: 'Secondary' });
    }

    if (emailsList.length === 1) {
      contactPayload.Emails = {
        ContactEmail: emailsList[0],
      };
    } else if (emailsList.length > 1) {
      contactPayload.Emails = {
        ContactEmail: emailsList,
      };
    }

    const newCustom = (req.body as any).custom !== undefined
      ? String((req.body as any).custom)
      : (contactObj?.custom !== undefined ? String(contactObj.custom) : vendor.custom);

    const newNoEmail = (req.body as any).no_email !== undefined
      ? !!(req.body as any).no_email
      : (contactObj?.noEmail !== undefined ? (contactObj.noEmail === 'true' || contactObj.noEmail === true) : vendor.no_email);

    const newNoPhone = (req.body as any).no_phone !== undefined
      ? !!(req.body as any).no_phone
      : (contactObj?.noPhone !== undefined ? (contactObj.noPhone === 'true' || contactObj.noPhone === true) : vendor.no_phone);

    const newNoMail = (req.body as any).no_mail !== undefined
      ? !!(req.body as any).no_mail
      : (contactObj?.noMail !== undefined ? (contactObj.noMail === 'true' || contactObj.noMail === true) : vendor.no_mail);

    if (newCustom !== undefined && newCustom !== null) {
      contactPayload.custom = newCustom;
    }
    if ((req.body as any).no_email !== undefined || contactObj?.noEmail !== undefined) {
      contactPayload.noEmail = newNoEmail ? 'true' : 'false';
    }
    if ((req.body as any).no_phone !== undefined || contactObj?.noPhone !== undefined) {
      contactPayload.noPhone = newNoPhone ? 'true' : 'false';
    }
    if ((req.body as any).no_mail !== undefined || contactObj?.noMail !== undefined) {
      contactPayload.noMail = newNoMail ? 'true' : 'false';
    }

    if (newWebsite) {
      contactPayload.Websites = newWebsite;
    }

    const lsPayload: any = {
      name: newName,
      accountNumber: newAccountNumber,
      priceLevel: newPriceLevel,
      updatePrice: newUpdatePrice ? 'true' : 'false',
      updateCost: newUpdateCost ? 'true' : 'false',
      updateDescription: newUpdateDescription ? 'true' : 'false',
      shareSellThrough: newShareSellThrough ? 'true' : 'false',
      b2bSellerUID: newB2bSellerUID,
    };

    if (archived !== undefined) {
      lsPayload.archived = newArchived ? 'true' : 'false';
    }
    if (Object.keys(contactPayload).length > 0) {
      lsPayload.Contact = contactPayload;
    }
    if (repPayload) {
      lsPayload.Reps = repPayload;
    }
    if (newCurrencyCode) {
      lsPayload.purchasingCurrency = {
        code: newCurrencyCode,
        symbol: newCurrencySymbol || '$',
        rate: String(newCurrencyRate || '1'),
      };
    }

    const isReadOnly = await LightspeedService.isReadOnlyMode();

    // ─── READ-ONLY BRANCH ──────────────────────────────────────────────────
    // If READ Only flag is true, only show the payload in console and do not write to POS or DB.
    if (isReadOnly) {
      console.log(
        `[READ-ONLY] Lightspeed Vendor UPDATE payload for vendor ID ${vendor.lightspeed_vendor_id}:\n`,
        JSON.stringify(lsPayload, null, 2)
      );
      logger.info(
        `[READ-ONLY] Lightspeed Vendor UPDATE payload (not sent): PUT /Vendor/${vendor.lightspeed_vendor_id}.json ` +
          JSON.stringify(lsPayload)
      );

      return res.sendSuccess(res, {
        message: 'Read-only mode is active. Payload displayed in console (no writes performed to POS or Database).',
        payload: lsPayload,
      });
    }

    // ─── WRITE ACCESS BRANCH ───────────────────────────────────────────────
    // When read-only mode is disabled, proceed with write access to Lightspeed POS and local Database.
    let lightspeedVendorId = vendor.lightspeed_vendor_id;
    if (!lightspeedVendorId || lightspeedVendorId.startsWith('local_')) {
      logger.info('Vendor has local ID only. Creating in Lightspeed POS with payload:', lsPayload);
      const response = await LightspeedService.createVendor(lsPayload);
      const responseList = LightspeedService.extractList<any>(response, 'Vendor');
      const lsVendor = responseList[0] || response.Vendor;
      if (!lsVendor || !lsVendor.vendorID) {
        throw new Error('Invalid response received from Lightspeed Vendor API.');
      }
      lightspeedVendorId = lsVendor.vendorID.toString();
    } else {
      logger.info(`Updating vendor ${lightspeedVendorId} in Lightspeed POS with payload:`, lsPayload);
      await LightspeedService.updateVendor(lightspeedVendorId, lsPayload);
    }

    const phoneToSave = phonesList.find(p => p.useType.toLowerCase() === 'work')?.number || phonesList[0]?.number || newPhone || null;
    const phoneMobileToSave = phonesList.find(p => p.useType.toLowerCase() === 'mobile')?.number || (req.body as any).mobile || (req.body as any).phone_mobile || vendor.phone_mobile;
    const phoneFaxToSave = phonesList.find(p => p.useType.toLowerCase() === 'fax')?.number || (req.body as any).fax || (req.body as any).phone_fax || vendor.phone_fax;

    const emailToSave = emailsList.find(e => e.useType.toLowerCase() === 'primary')?.address || emailsList[0]?.address || newEmail || null;
    const emailSecondaryToSave = emailsList.find(e => e.useType.toLowerCase() === 'secondary')?.address || (req.body as any).email_2 || (req.body as any).email_secondary || vendor.email_secondary;

    // Persist locally in Database
    await vendor.update({
      lightspeed_vendor_id: lightspeedVendorId,
      name: newName,
      archived: newArchived,
      account_number: newAccountNumber,
      price_level: newPriceLevel,
      update_price: newUpdatePrice,
      update_cost: newUpdateCost,
      update_description: newUpdateDescription,
      share_sell_through: newShareSellThrough,
      b2b_seller_uid: newB2bSellerUID,
      purchasing_currency_code: newCurrencyCode,
      purchasing_currency_symbol: newCurrencySymbol,
      purchasing_currency_rate: newCurrencyRate,
      rep_first_name: newRepFirstName,
      rep_last_name: newRepLastName,
      address_1: newAddress1 || null,
      address_2: newAddress2 || null,
      city: newCity || null,
      state: newState || null,
      state_code: newStateCode || null,
      zip: newZip || null,
      country: newCountry || null,
      country_code: newCountryCode || null,
      phone: phoneToSave,
      phone_mobile: phoneMobileToSave,
      phone_fax: phoneFaxToSave,
      email: emailToSave,
      email_secondary: emailSecondaryToSave,
      website: newWebsite || null,
      custom: newCustom || null,
      no_email: newNoEmail,
      no_phone: newNoPhone,
      no_mail: newNoMail,
    });

    // Update entity mapping for change detection
    const payloadForHash = {
      name: vendor.name,
      archived: vendor.archived,
      account_number: vendor.account_number,
      price_level: vendor.price_level,
      update_price: vendor.update_price,
      update_cost: vendor.update_cost,
      update_description: vendor.update_description,
      share_sell_through: vendor.share_sell_through,
      b2b_seller_uid: vendor.b2b_seller_uid,
      purchasing_currency_code: vendor.purchasing_currency_code,
      purchasing_currency_symbol: vendor.purchasing_currency_symbol,
      purchasing_currency_rate: vendor.purchasing_currency_rate,
      rep_first_name: vendor.rep_first_name,
      rep_last_name: vendor.rep_last_name,
      address_1: vendor.address_1,
      address_2: vendor.address_2,
      city: vendor.city,
      state: vendor.state,
      state_code: vendor.state_code,
      zip: vendor.zip,
      country: vendor.country,
      country_code: vendor.country_code,
      phone: vendor.phone,
      phone_mobile: vendor.phone_mobile,
      phone_fax: vendor.phone_fax,
      email: vendor.email,
      email_secondary: vendor.email_secondary,
      website: vendor.website,
      contact_id: vendor.contact_id,
      custom: vendor.custom,
      no_email: vendor.no_email,
      no_phone: vendor.no_phone,
      no_mail: vendor.no_mail,
    };
    const hash = LightspeedService.calculateHash(payloadForHash);

    await LightspeedEntityMap.upsert({
      entity_type: 'vendor',
      lightspeed_id: lightspeedVendorId,
      local_id: vendor.id,
      hash,
      last_sync: new Date(),
    });

    return res.sendSuccess(res, {
      vendor: formatVendor(vendor),
      message: 'Vendor updated successfully in Lightspeed and local database.',
    });
  } catch (error: unknown) {
    console.error(error);
    return res.sendError(res, (error as Error).message || 'ERR_INTERNAL_SERVER_ERROR');
  }
};

// ---------------------------------------------------------------------------
// 5. DELETE /vendor/:id — Archive/Delete vendor locally (maps to DELETE /Vendor/{vendorID}.json)
// ---------------------------------------------------------------------------

export const deleteVendor = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.sendError(res, 'Invalid vendor ID.');
    }

    const vendor = await Vendor.findByPk(id);
    if (!vendor) {
      return res.sendError(res, 'Vendor not found.');
    }

    const lightspeedVendorId = vendor.lightspeed_vendor_id;

    const isReadOnly = await LightspeedService.isReadOnlyMode();

    // ─── READ-ONLY BRANCH ──────────────────────────────────────────────────
    // If READ Only flag is true, only show the delete payload in console and do not write to POS or DB.
    if (isReadOnly) {
      console.log(
        `[READ-ONLY] Lightspeed Vendor DELETE payload for vendor ID ${lightspeedVendorId}: DELETE /Vendor/${lightspeedVendorId}.json`
      );
      logger.info(
        `[READ-ONLY] Lightspeed Vendor DELETE payload (not sent): DELETE /Vendor/${lightspeedVendorId}.json`
      );

      return res.sendSuccess(res, {
        message: 'Read-only mode is active. Delete payload displayed in console (no writes performed to POS or Database).',
        vendorID: lightspeedVendorId,
      });
    }

    // ─── WRITE ACCESS BRANCH ───────────────────────────────────────────────
    // When read-only mode is disabled, proceed with write access to Lightspeed POS and local Database.
    if (lightspeedVendorId && !lightspeedVendorId.startsWith('local_')) {
      logger.info(`Archiving vendor ${lightspeedVendorId} in Lightspeed POS via DELETE...`);
      await LightspeedService.archiveVendor(lightspeedVendorId);
    }

    await vendor.destroy();

    if (lightspeedVendorId) {
      await LightspeedEntityMap.destroy({
        where: {
          entity_type: 'vendor',
          lightspeed_id: lightspeedVendorId,
        },
      });
    }

    return res.sendSuccess(res, {
      message: `Vendor '${vendor.name}' deleted successfully from Lightspeed and local database.`,
    });
  } catch (error: unknown) {
    console.error(error);
    return res.sendError(res, (error as Error).message || 'ERR_INTERNAL_SERVER_ERROR');
  }
};

// ---------------------------------------------------------------------------
// Default export
// ---------------------------------------------------------------------------

export default {
  getVendors,
  getVendor,
  createVendor,
  updateVendor,
  deleteVendor,
};
