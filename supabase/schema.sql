-- ============================================
-- BRIGADA ODONTOLÓGICA - ESQUEMA DE BASE DE DATOS
-- ============================================

CREATE TABLE IF NOT EXISTS doctors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'occupied')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(150) NOT NULL,
  age INTEGER NOT NULL,
  gender VARCHAR(20) NOT NULL CHECK (gender IN ('M', 'F', 'Otro')),
  phone VARCHAR(30),
  health_conditions TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'in_progress', 'attended', 'paid')),
  queue_number INTEGER NOT NULL,
  assigned_doctor_id UUID REFERENCES doctors(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS patient_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES services(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(patient_id, service_id)
);

CREATE TABLE IF NOT EXISTS attended_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES services(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(patient_id, service_id)
);

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  total DECIMAL(10,2) NOT NULL,
  amount_paid DECIMAL(10,2) NOT NULL,
  change_amount DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patients_status ON patients(status);
CREATE INDEX IF NOT EXISTS idx_patients_queue ON patients(queue_number);
CREATE INDEX IF NOT EXISTS idx_doctors_status ON doctors(status);
CREATE INDEX IF NOT EXISTS idx_patient_services_patient ON patient_services(patient_id);
CREATE INDEX IF NOT EXISTS idx_attended_services_patient ON attended_services(patient_id);

CREATE OR REPLACE FUNCTION get_next_queue_number()
RETURNS INTEGER AS $$
DECLARE
  next_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(queue_number), 0) + 1 INTO next_num FROM patients;
  RETURN next_num;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION register_patient(
  p_name VARCHAR,
  p_age INTEGER,
  p_gender VARCHAR,
  p_phone VARCHAR,
  p_health_conditions TEXT,
  p_service_ids UUID[]
)
RETURNS TABLE(queue_number INTEGER) AS $$
DECLARE
  v_patient_id UUID;
  v_queue_number INTEGER;
  service_id UUID;
BEGIN
  SELECT get_next_queue_number() INTO v_queue_number;

  INSERT INTO patients (name, age, gender, phone, health_conditions, queue_number)
  VALUES (p_name, p_age, p_gender, p_phone, p_health_conditions, v_queue_number)
  RETURNING id INTO v_patient_id;

  FOREACH service_id IN ARRAY p_service_ids LOOP
    INSERT INTO patient_services (patient_id, service_id)
    VALUES (v_patient_id, service_id);
  END LOOP;

  RETURN QUERY SELECT v_queue_number;
END;
$$ LANGUAGE plpgsql;

INSERT INTO services (name, price) VALUES
  ('Extracción de Muelas', 100),
  ('Limpieza Dental', 100),
  ('Aplicación de Flúor', 50),
  ('Medición de Presión', 50),
  ('Medición de Azúcar', 50)
ON CONFLICT DO NOTHING;

ALTER TABLE doctors ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE attended_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access" ON doctors FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON services FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON patients FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON patient_services FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON attended_services FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON payments FOR ALL USING (true) WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE doctors;
ALTER PUBLICATION supabase_realtime ADD TABLE patients;
ALTER PUBLICATION supabase_realtime ADD TABLE services;
ALTER PUBLICATION supabase_realtime ADD TABLE patient_services;
ALTER PUBLICATION supabase_realtime ADD TABLE attended_services;
ALTER PUBLICATION supabase_realtime ADD TABLE payments;
