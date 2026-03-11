-- Add CREDIT_CARD payment option for sales checkout.
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'CREDIT_CARD';
