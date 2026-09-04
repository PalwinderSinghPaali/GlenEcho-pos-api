import { validationResult } from 'express-validator';
import { customerCreateValidator, customerUpdateValidator } from './customer';

describe('Customer Validators', () => {
  const runValidators = async (validators: any[], body: any) => {
    const req: any = { body };
    for (const validator of validators) {
      await validator.run(req);
    }
    return validationResult(req);
  };

  describe('customerCreateValidator', () => {
    it('should pass when required fields are present and optional fields are null', async () => {
      const body = {
        first_name: 'John',
        last_name: 'Doe',
        email_primary: null,
        email_secondary: null,
        dob: null,
        no_email: null,
        no_phone: null,
        no_mail: null,
        note_is_public: null,
        customer_type_id: null,
        credit_account_id: null,
        tax_category_id: null,
        discount_id: null,
        custom: null,
        phone_mobile: null,
        phone_home: null,
        phone_work: null,
        phone_pager: null,
        phone_fax: null,
      };

      const result = await runValidators(customerCreateValidator, body);
      expect(result.isEmpty()).toBe(true);
      expect(result.array()).toEqual([]);
    });

    it('should pass when optional fields are empty strings', async () => {
      const body = {
        first_name: 'John',
        last_name: 'Doe',
        email_primary: '',
        email_secondary: '',
        dob: '',
        no_email: '',
        no_phone: '',
        no_mail: '',
        note_is_public: '',
        customer_type_id: '',
        credit_account_id: '',
        tax_category_id: '',
        discount_id: '',
        custom: '',
        phone_mobile: '',
        phone_home: '',
        phone_work: '',
        phone_pager: '',
        phone_fax: '',
      };

      const result = await runValidators(customerCreateValidator, body);
      expect(result.isEmpty()).toBe(true);
    });

    it('should fail when required fields first_name or last_name are missing or empty', async () => {
      const body = {
        first_name: '',
        last_name: '',
      };

      const result = await runValidators(customerCreateValidator, body);
      expect(result.isEmpty()).toBe(false);
      const errors = result.array();
      expect(errors.some((e: any) => e.path === 'first_name')).toBe(true);
      expect(errors.some((e: any) => e.path === 'last_name')).toBe(true);
    });

    it('should fail when invalid types are provided for numeric or email fields', async () => {
      const body = {
        first_name: 'John',
        last_name: 'Doe',
        email_primary: 'not-an-email',
        discount_id: 'not-a-number',
      };

      const result = await runValidators(customerCreateValidator, body);
      expect(result.isEmpty()).toBe(false);
      const errors = result.array();
      expect(errors.some((e: any) => e.path === 'email_primary')).toBe(true);
      expect(errors.some((e: any) => e.path === 'discount_id')).toBe(true);
    });
  });

  describe('customerUpdateValidator', () => {
    it('should pass when all fields including first_name, last_name, and custom are null', async () => {
      const body = {
        first_name: null,
        last_name: null,
        custom: null,
        phone_mobile: null,
        phone_home: null,
        phone_work: null,
        phone_pager: null,
        phone_fax: null,
        no_email: null,
        no_phone: null,
        no_mail: null,
        note_is_public: null,
        customer_type_id: null,
        credit_account_id: null,
        tax_category_id: null,
        discount_id: null,
        email_primary: null,
        email_secondary: null,
        dob: null,
      };

      const result = await runValidators(customerUpdateValidator, body);
      expect(result.isEmpty()).toBe(true);
      expect(result.array()).toEqual([]);
    });

    it('should pass when empty strings are provided in partial update', async () => {
      const body = {
        first_name: '',
        last_name: '',
        custom: '',
        phone_mobile: '',
        phone_home: '',
        phone_work: '',
        phone_pager: '',
        phone_fax: '',
        email_primary: '',
      };

      const result = await runValidators(customerUpdateValidator, body);
      expect(result.isEmpty()).toBe(true);
    });

    it('should fail when invalid values are provided in update', async () => {
      const body = {
        discount_id: 'abc',
        no_email: 'not_a_bool',
      };

      const result = await runValidators(customerUpdateValidator, body);
      expect(result.isEmpty()).toBe(false);
      const errors = result.array();
      expect(errors.some((e: any) => e.path === 'discount_id')).toBe(true);
      expect(errors.some((e: any) => e.path === 'no_email')).toBe(true);
    });
  });
});
