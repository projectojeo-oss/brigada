export interface Doctor {
  id: string;
  name: string;
  status: "available" | "occupied";
  created_at: string;
}

export interface Service {
  id: string;
  name: string;
  price: number;
  active: boolean;
  created_at: string;
}

export interface Patient {
  id: string;
  name: string;
  age: number;
  gender: "M" | "F" | "Otro";
  phone: string | null;
  health_conditions: string | null;
  status: "waiting" | "in_progress" | "attended" | "paid";
  queue_number: number;
  assigned_doctor_id: string | null;
  created_at: string;
  assigned_doctor?: Doctor | null;
}

export interface PatientService {
  id: string;
  patient_id: string;
  service_id: string;
  created_at: string;
  service?: Service;
}

export interface AttendedService {
  id: string;
  patient_id: string;
  service_id: string;
  created_at: string;
  service?: Service;
}

export interface Payment {
  id: string;
  patient_id: string;
  total: number;
  amount_paid: number;
  change_amount: number;
  created_at: string;
}

export interface PatientWithServices extends Patient {
  patient_services: PatientService[];
  attended_services: AttendedService[];
  payment?: Payment | null;
}
