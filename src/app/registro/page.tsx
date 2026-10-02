"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { Service, Patient } from "@/lib/types";

export default function RegistroPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [recentPatients, setRecentPatients] = useState<Patient[]>([]);
  const [form, setForm] = useState({
    name: "",
    age: "",
    gender: "M" as "M" | "F" | "Otro",
    phone: "",
    health_conditions: "",
  });
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");

  const fetchServices = useCallback(async () => {
    const { data } = await supabase
      .from("services")
      .select("*")
      .eq("active", true)
      .order("name");
    if (data) setServices(data);
  }, []);

  const fetchRecentPatients = useCallback(async () => {
    const { data } = await supabase
      .from("patients")
      .select("*")
      .order("queue_number", { ascending: false })
      .limit(10);
    if (data) setRecentPatients(data);
  }, []);

  useEffect(() => {
    fetchServices();
    fetchRecentPatients();

    const channel = supabase
      .channel("patients-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "patients" },
        () => fetchRecentPatients()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchServices, fetchRecentPatients]);

  const toggleService = (id: string) => {
    setSelectedServices((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.age || selectedServices.length === 0) {
      alert("Completa todos los campos y selecciona al menos un servicio");
      return;
    }

    setLoading(true);
    try {
      const { data: patient, error } = await supabase.rpc("register_patient", {
        p_name: form.name,
        p_age: parseInt(form.age),
        p_gender: form.gender,
        p_phone: form.phone || null,
        p_health_conditions: form.health_conditions || null,
        p_service_ids: selectedServices,
      });

      if (error) throw error;

      setSuccess(`Paciente registrado con número de cola: #${patient?.queue_number}`);
      setForm({ name: "", age: "", gender: "M", phone: "", health_conditions: "" });
      setSelectedServices([]);
      fetchRecentPatients();

      setTimeout(() => setSuccess(""), 3000);
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-blue-800">Registro de Pacientes</h1>
          <a href="/" className="text-blue-600 hover:underline text-sm">← Inicio</a>
        </div>

        {success && (
          <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
            {success}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Datos del Paciente</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre completo *
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Edad *
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="120"
                    value={form.age}
                    onChange={(e) => setForm({ ...form, age: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Género *
                  </label>
                  <select
                    value={form.gender}
                    onChange={(e) => setForm({ ...form, gender: e.target.value as any })}
                    className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="M">Masculino</option>
                    <option value="F">Femenino</option>
                    <option value="Otro">Otro</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Teléfono
                </label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Padecimientos de salud
                </label>
                <textarea
                  value={form.health_conditions}
                  onChange={(e) => setForm({ ...form, health_conditions: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  rows={2}
                  placeholder="Diabetes, hipertensión, alergias..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Servicios solicitados *
                </label>
                <div className="space-y-2">
                  {services.map((service) => (
                    <label
                      key={service.id}
                      className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-colors ${
                        selectedServices.includes(service.id)
                          ? "border-blue-500 bg-blue-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={selectedServices.includes(service.id)}
                          onChange={() => toggleService(service.id)}
                          className="w-4 h-4 text-blue-600"
                        />
                        <span className="font-medium">{service.name}</span>
                      </div>
                      <span className="text-green-700 font-semibold">
                        L. {service.price.toFixed(2)}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-3 rounded-lg transition-colors"
              >
                {loading ? "Registrando..." : "Registrar Paciente"}
              </button>
            </div>
          </form>

          <div className="bg-white rounded-xl shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Últimos Registrados</h2>
            <div className="space-y-3">
              {recentPatients.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div>
                    <div className="font-medium">#{p.queue_number} - {p.name}</div>
                    <div className="text-sm text-gray-500">
                      {p.age} años · {p.gender === "M" ? "Masculino" : p.gender === "F" ? "Femenino" : "Otro"}
                    </div>
                  </div>
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-medium ${
                      p.status === "waiting"
                        ? "bg-yellow-100 text-yellow-800"
                        : p.status === "in_progress"
                        ? "bg-blue-100 text-blue-800"
                        : p.status === "attended"
                        ? "bg-green-100 text-green-800"
                        : "bg-gray-100 text-gray-800"
                    }`}
                  >
                    {p.status === "waiting"
                      ? "En espera"
                      : p.status === "in_progress"
                      ? "En atención"
                      : p.status === "attended"
                      ? "Atendido"
                      : "Pagado"}
                  </span>
                </div>
              ))}
              {recentPatients.length === 0 && (
                <p className="text-gray-400 text-center py-8">
                  No hay pacientes registrados
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
