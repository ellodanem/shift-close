-- Fuel invoice numbers identify a supplier invoice and must not be reused,
-- even after that invoice has been paid.
CREATE UNIQUE INDEX "invoices_invoice_number_key" ON "invoices"("invoice_number");
