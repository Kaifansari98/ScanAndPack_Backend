export interface CreateClientInput {
    vendor_id: number;
    name: string;
    contact: string;
    alt_contact?: string;
    email: string;
    address: string;
    city: string;
    state: string;
    country: string;
    pincode: string;
    clientCode: string;
    gst_number?: string;
    company_name?: string;
    client_type_id?: number;
    is_active?: boolean;
}

export interface UpdateClientInput extends Partial<Omit<CreateClientInput, "vendor_id">> {}
