"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { Doctor, Service, Patient, PatientService, AttendedService } from "@/lib/types";

export default function AsistentePage() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>("");
  const [currentPatient, setCurrentPatient] = useState<Patient | null>(null);
  const [patientServices, setPatientServices] = useState<PatientService[]>([]);
  const [attendedServices, setAttendedServices] = useState<AttendedService[]>([]);
  const [allServices, setAllServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(false);
  const [nextInQueue, setNextInQueue] = useState<Patient[]>([]);

  const fetchDoctors = useCallback(async () => {
    const { data } = await supabase.from("doctors").select("*").order("name");
    if (data) {
      setDoctors(data);
      if (!selectedDoctorId && data.length > 0) {
        setSelectedDoctorId(data[0].id);
      }
    }
  }, [selectedDoctorId]);

  const fetchAllServices = useCallback(async () => {
    const { data } = await supabase
      .from("services")
      .select("*")
      .eq("active", true)
      .order("name");
    if (data) setAllServices(data);
  }, []);

  const fetchCurrentPatient = useCallback(async () => {
    if (!selectedDoctorId) return;

    const { data: patient } = await supabase
      .from("patients")
      .select("*, assigned_doctor:doctors(*)")
      .eq("assigned_doctor_id", selectedDoctorId)
      .in("status", ["waiting", "in_progress"])
      .order("queue_number", { ascending: true })
      .maybeSingle();

    setCurrentPatient(patient as Patient | null);

    if (patient) {
      const { data: pServices } = await supabase
        .from("patient_services")
        .select("*, service:services(*)")
        .eq("patient_id", patient.id);
      setPatientServices((pServices as PatientService[]) || []);

      const { data: aServices } = await supabase
        .from("attended_services")
        .select("*, service:services(*)")
        .eq("patient_id", patient.id);
      setAttendedServices((aServices as AttendedService[]) || []);
    } else {
      setPatientServices([]);
      setAttendedServices([]);
    }
  }, [selectedDoctorId]);

  const fetchNextInQueue = useCallback(async () => {
    const { data } = await supabase
      .from("patients")
      .select("*")
      .eq("status", "waiting")
      .is("assigned_doctor_id", null)
      .order("queue_number", { ascending: true })
      .limit(5);
    setNextInQueue(data || []);
  }, []);

  useEffect(() => {
    fetchDoctors();
    fetchAllServices();
  }, [fetchDoctors, fetchAllServices]);

  useEffect(() => {
    fetchCurrentPatient();
    fetchNextInQueue();
  }, [selectedDoctorId, fetchCurrentPatient, fetchNextInQueue]);

  useEffect(() => {
    const channel = supabase
      .channel("asistente-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "patients" }, () => {
        fetchCurrentPatient();
        fetchNextInQueue();
        fetchDoctors();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "doctors" }, () => {
        fetchDoctors();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "attended_services" }, () => {
        fetchCurrentPatient();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchCurrentPatient, fetchNextInQueue, fetchDoctors]);

  const assignPatient = async () => {
    if (!selectedDoctorId || nextInQueue.length === 0) return;

    const patient = nextInQueue[0];
    setLoading(true);

    const { error } = await supabase
      .from("patients")
      .update({ assigned_doctor_id: selectedDoctorId, status: "in_progress" })
      .eq("id", patient.id);

    if (!error) {
      await supabase
        .from("doctors")
        .update({ status: "occupied" })
        .eq("id", selectedDoctorId);
    }

    setLoading(false);
  };

  const toggleAttendedService = async (serviceId: string) => {
    if (!currentPatient) return;

    const exists = attendedServices.some((s) => s.service_id === serviceId);

    if (exists) {
      await supabase
        .from("attended_services")
        .delete()
        .eq("patient_id", currentPatient.id)
        .eq("service_id", serviceId);
    } else {
      await supabase
        .from("attended_services")
        .insert({ patient_id: currentPatient.id, service_id: serviceId });
    }

    fetchCurrentPatient();
  };

  const markAsAttended = async () => {
    if (!currentPatient || !selectedDoctorId) return;

    setLoading(true);

    await supabase
      .from("patients")
      .update({ status: "attended" })
      .eq("id", currentPatient.id);

    await supabase
      .from("doctors")
      .update({ status: "available" })
      .eq("id", selectedDoctorId);

    setLoading(false);
  };

  const selectedDoctor = doctors.find((d) => d.id === selectedDoctorId);
  const attendedServiceIds = attendedServices.map((s) => s.service_id);
  const totalAttended = attendedServices.reduce((sum, s) => sum + (s.service?.price || 0), 0);

  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-green-800">Panel del Asistente</h1>
          <a href="/" className="text-blue-600 hover:underline text-sm">← Inicio</a>
        </div>

        <div className="bg-white rounded-xl shadow p-4 mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Selecciona tu doctor:
          </label>
          <div className="flex flex-wrap gap-2">
            {doctors.map((doc) => (
              <button
                key={doc.id}
                onClick={() => setSelectedDoctorId(doc.id)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  selectedDoctorId === doc.id
                    ? "bg-green-600 text-white"
                    : doc.status === "available"
                    ? "bg-green-100 text-green-800 hover:bg-green-200"
                    : "bg-red-100 text-red-800 hover:bg-red-200"
                }`}
              >
                {doc.name}
                <span className="ml-2 text-xs">
                  {doc.status === "available" ? "● Disponible" : "● Ocupado"}
                </span>
              </button>
            ))}
          </div>
        </div>

        {currentPatient ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl shadow p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Paciente Actual</h2>
                <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">
                  #{currentPatient.queue_number}
                </span>
              </div>

              <div className="space-y-3 mb-6">
                <div>
                  <span className="text-sm text-gray-500">Nombre:</span>
                  <p className="font-semibold text-lg">{currentPatient.name}</p>
                </div>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Edad:</span>
                    <p className="font-medium">{currentPatient.age} años</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Género:</span>
                    <p className="font-medium">
                      {currentPatient.gender === "M" ? "Masculino" : currentPatient.gender === "F" ? "Femenino" : "Otro"}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500">Teléfono:</span>
                    <p className="font-medium">{currentPatient.phone || "N/A"}</p>
                  </div>
                </div>
                {currentPatient.health_conditions && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <span className="text-sm font-medium text-red-700">⚠️ Padecimientos:</span>
                    <p className="text-sm text-red-600 mt-1">{currentPatient.health_conditions}</p>
                  </div>
                )}
              </div>

              <div className="border-t pt-4">
                <h3 className="font-semibold mb-3">Servicios realizados:</h3>
                <div className="space-y-2">
                  {allServices.map((service) => {
                    const isAttended = attendedServiceIds.includes(service.id);
                    const wasRequested = patientServices.some((s) => s.service_id === service.id);
                    return (
                      <label
                        key={service.id}
                        className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-colors ${
                          isAttended
                            ? "border-green-500 bg-green-50"
                            : "border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={isAttended}
                            onChange={() => toggleAttendedService(service.id)}
                            className="w-4 h-4 text-green-600"
                          />
                          <span className="font-medium">{service.name}</span>
                          {wasRequested && !isAttended && (
                            <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded">
                              Solicitado
                            </span>
                          )}
                        </div>
                        <span className="text-green-700 font-semibold">
                          L. {service.price.toFixed(2)}
                        </span>
                      </label>
                    );
                  })}
                </div>

                <div className="mt-4 p-3 bg-gray-50 rounded-lg flex justify-between items-center">
                  <span className="font-semibold">Total:</span>
                  <span className="text-xl font-bold text-green-700">
                    L. {totalAttended.toFixed(2)}
                  </span>
                </div>

                <button
                  onClick={markAsAttended}
                  disabled={loading || attendedServices.length === 0}
                  className="w-full mt-4 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-semibold py-3 rounded-lg transition-colors"
                >
                  {loading ? "Procesando..." : "✓ Marcar como Atendido"}
                </button>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow p-6">
              <h2 className="text-lg font-semibold mb-4">Cola de Espera</h2>
              {nextInQueue.length > 0 ? (
                <div className="space-y-3">
                  {nextInQueue.map((p, i) => (
                    <div
                      key={p.id}
                      className={`p-3 rounded-lg border ${
                        i === 0 ? "border-blue-300 bg-blue-50" : "border-gray-200"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-medium">#{p.queue_number} - {p.name}</span>
                          <span className="text-sm text-gray-500 ml-2">
                            {p.age} años
                          </span>
                        </div>
                        {i === 0 && (
                          <span className="text-xs bg-blue-600 text-white px-2 py-1 rounded">
                            Siguiente
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-400 text-center py-8">
                  No hay pacientes en espera
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow p-8 text-center">
            <p className="text-gray-500 mb-4">
              {selectedDoctor?.status === "available"
                ? "No tienes un paciente asignado"
                : "No hay paciente asignado"}
            </p>
            {nextInQueue.length > 0 && (
              <button
                onClick={assignPatient}
                disabled={loading}
                className="bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
              >
                {loading
                  ? "Asignando..."
                  : `Asignar siguiente: #${nextInQueue[0].queue_number} - ${nextInQueue[0].name}`}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
