-- ==========================================
-- SEED: Users
-- ==========================================
INSERT INTO users (nama, pin, role) VALUES
  ('admin', '123456', 'admin'),
  ('Budi', '1234', 'kasir'),
  ('Sari', '5678', 'kasir'),
  ('Adi', '9012', 'kasir');

-- ==========================================
-- SEED: Produk
-- ==========================================
INSERT INTO produk (nama, tipe, harga_jual, harga_modal, is_active) VALUES
  ('Kopi Susu', 'tinuku', 15000, 8000, 1),
  ('Teh Manis', 'tinuku', 10000, 4000, 1),
  ('Roti Bakar', 'tinuku', 18000, 10000, 1);
