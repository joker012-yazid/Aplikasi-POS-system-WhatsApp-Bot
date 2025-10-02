export type CustomerFormSectionId = 'personal' | 'device' | 'issue' | 'consent';

export type CustomerFormOption = {
  value: string;
  label: { en: string; ms: string };
};

export type CustomerFormFieldType =
  | 'text'
  | 'email'
  | 'phone'
  | 'textarea'
  | 'select'
  | 'checkbox'
  | 'photos';

export type CustomerFormField = {
  id:
    | 'name'
    | 'phone'
    | 'email'
    | 'address'
    | 'category'
    | 'brand'
    | 'model'
    | 'serial'
    | 'accessories'
    | 'description'
    | 'photos'
    | 'terms'
    | 'whatsappOptIn';
  section: CustomerFormSectionId;
  type: CustomerFormFieldType;
  label: { en: string; ms: string };
  placeholder?: { en: string; ms: string };
  helperText?: { en: string; ms: string };
  options?: CustomerFormOption[];
  enabled: boolean;
  required: boolean;
};

export type CustomerFormSection = {
  id: CustomerFormSectionId;
  title: { en: string; ms: string };
  description?: { en: string; ms: string };
};

export type CustomerFormConfig = {
  version: number;
  sections: CustomerFormSection[];
  fields: CustomerFormField[];
};

export type CustomerFormStatePayload = {
  value: {
    version: number;
    fields: Array<Pick<CustomerFormField, 'id' | 'enabled' | 'required'>>;
  };
};
