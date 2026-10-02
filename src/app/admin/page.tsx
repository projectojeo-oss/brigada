"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { Doctor, Service, Patient, AttendedService, Payment } from "@/lib/types";

interface ReportPatient extends Patient {
  attended_services: AttendedService[];
  payment?: Payment | null;
}

export default function AdminPage() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [patients, setPatients] = useState<ReportPatient[]>([]);
  const [activeTab, setActiveTab] = useState<"reportes" | "doctores" | "servicios">("reportes");

  const [filters, setFilters] = useState({
    service: "",
    gender: "",
    ageMin: "",
    ageMax: "",
    status: "",
    dateFrom: "",
    dateTo: "",
  });

  const fetchData = useCallback(async () => {
    const [{ data: docData }, { data: servData }, { data: patData }] = await Promise.all([
      supabase.from("doctors").select("*").order("name"),
      supabase.from("services").select("*").order("name"),
      supabase
        .from("patients")
        .select("*, attended_services(*, service:services(*)), payment:payments(*)")
        .order("queue_number", { ascending: false }),
    ]);

    if (docData) setDoctors(docData);
    if (servData) setServices(servData);
    if (patData) {
      const mapped = patData.map((p: any) => ({
        ...p,
        payment: p.payment?.[0] || null,
      }));
      setPatients(mapped);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredPatients = patients.filter((p) => {
    if (filters.service) {
      const hasService = p.attended_services.some((s) => s.service_id === filters.service);
      if (!hasService) return false;
    }
    if (filters.gender && p.gender !== filters.gender) return false;
    if (filters.ageMin && p.age < parseInt(filters.ageMin)) return false;
    if (filters.ageMax && p.age > parseInt(filters.ageMax)) return false;
    if (filters.status && p.status !== filters.status) return false;
    if (filters.dateFrom && new Date(p.created_at) < new Date(filters.dateFrom)) return false;
    if (filters.dateTo && new Date(p.created_at) > new Date(filters.dateTo + "T23:59:59")) return false;
    return true;
  });

  const totalRevenue = filteredPatients.reduce(
    (sum, p) => sum + (p.payment?.total || 0),
    0
  );

  const exportCSV = () => {
    const headers = [
      "Cola", "Nombre", "Edad", "Género", "Teléfono", "Estado",
      "Servicios", "Total", "Pagado", "Cambio", "Fecha"
    ];

    const rows = filteredPatients.map((p) => [
      p.queue_number,
      p.name,
      p.age,
      p.gender === "M" ? "Masculino" : p.gender === "F" ? "Femenino" : "Otro",
      p.phone || "",
      p.status === "waiting" ? "En espera" : p.status === "in_progress" ? "En atención" : p.status === "attended" ? "Atendido" : "Pagado",
      p.attended_services.map((s) => s.service?.name).join(", "),
      p.payment?.total?.toFixed(2) || "0.00",
      p.payment?.amount_paid?.toFixed(2) || "0.00",
      p.payment?.change_amount?.toFixed(2) || "0.00",
      new Date(p.created_at).toLocaleString("es-HN"),
    ]);

    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reporte_brigada_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  };

  const addDoctor = async () => {
    const name = prompt("Nombre del doctor:");
    if (!name) return;
    await supabase.from("doctors").insert({ name });
    fetchData();
  };

  const toggleDoctorStatus = async (id: string, currentStatus: string) => {
    await supabase
      .from("doctors")
      .update({ status: currentStatus === "available" ? "occupied" : "available" })
      .eq("id", id);
    fetchData();
  };

  const deleteDoctor = async (id: string) => {
    if (!confirm("¿Eliminar este doctor?")) return;
    await supabase.from("doctors").delete().eq("id", id);
    fetchData();
  };

  const addService = async () => {
    const name = prompt("Nombre del servicio:");
    if (!name) return;
    const price = prompt("Precio (L.):");
    if (!price) return;
    await supabase.from("services").insert({ name, price: parseFloat(price) });
    fetchData();
  };

  const toggleServiceActive = async (id: string, current: boolean) => {
    await supabase.from("services").update({ active: !current }).eq("id", id);
    fetchData();
  };

  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-purple-800">Panel de Administración</h1>
          <a href="/" className="text-blue-600 hover:underline text-sm">← Inicio</a>
        </div>

        <div className="flex gap-2 mb-6">
          {(["reportes", "doctores", "servicios"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === tab
                  ? "bg-purple-600 text-white"
                  : "bg-white text-gray-700 hover:bg-gray-100"
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {activeTab === "reportes" && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow p-6">
              <h2 className="text-lg font-semibold mb-4">Filtros</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Servicio</label>
                  <select
                    value={filters.service}
                    onChange={(e) => setFilters({ ...filters, service: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  >
                    <option value="">Todos</option>
                    {services.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Género</label>
                  <select
                    value={filters.gender}
                    onChange={(e) => setFilters({ ...filters, gender: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  >
                    <option value="">Todos</option>
                    <option value="M">Masculino</option>
                    <option value="F">Femenino</option>
                    <option value="Otro">Otro</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Edad mín.</label>
                  <input
                    type="number"
                    value={filters.ageMin}
                    onChange={(e) => setFilters({ ...filters, ageMin: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Edad máx.</label>
                  <input
                    type="number"
                    value={filters.ageMax}
                    onChange={(e) => setFilters({ ...filters, ageMax: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                    placeholder="120"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Estado</label>
                  <select
                    value={filters.status}
                    onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  >
                    <option value="">Todos</option>
                    <option value="waiting">En espera</option>
                    <option value="in_progress">En atención</option>
                    <option value="attended">Atendido</option>
                    <option value="paid">Pagado</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Desde</label>
                  <input
                    type="date"
                    value={filters.dateFrom}
                    onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Hasta</label>
                  <input
                    type="date"
                    value={filters.dateTo}
                    onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    onClick={() => setFilters({ service: "", gender: "", ageMin: "", ageMax: "", status: "", dateFrom: "", dateTo: "" })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Limpiar
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold">Resultados</h2>
                  <p className="text-sm text-gray-500">
                    {filteredPatients.length} pacientes · Ingresos totales:{" "}
                    <span className="font-bold text-green-700">L. {totalRevenue.toFixed(2)}</span>
                  </p>
                </div>
                <button
                  onClick={exportCSV}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                >
                  Exportar CSV
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-2">#</th>
                      <th className="text-left py-2 px-2">Nombre</th>
                      <th className="text-left py-2 px-2">Edad</th>
                      <th className="text-left py-2 px-2">Género</th>
                      <th className="text-left py-2 px-2">Estado</th>
                      <th className="text-left py-2 px-2">Servicios</th>
                      <th className="text-right py-2 px-2">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPatients.slice(0, 100).map((p) => (
                      <tr key={p.id} className="border-b hover:bg-gray-50">
                        <td className="py-2 px-2">{p.queue_number}</td>
                        <td className="py-2 px-2 font-medium">{p.name}</td>
                        <td className="py-2 px-2">{p.age}</td>
                        <td className="py-2 px-2">
                          {p.gender === "M" ? "Masc." : p.gender === "F" ? "Fem." : "Otro"}
                        </td>
                        <td className="py-2 px-2">
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-medium ${
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
                              ? "Espera"
                              : p.status === "in_progress"
                              ? "Atención"
                              : p.status === "attended"
                              ? "Atendido"
                              : "Pagado"}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-xs">
                          {p.attended_services.map((s) => s.service?.name).join(", ") || "-"}
                        </td>
                        <td className="py-2 px-2 text-right font-medium">
                          L. {(p.payment?.total || 0).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredPatients.length > 100 && (
                  <p className="text-center text-sm text-gray-400 py-2">
                    Mostrando 100 de {filteredPatients.length} resultados. Exporta CSV para ver todos.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === "doctores" && (
          <div className="bg-white rounded-xl shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Gestión de Doctores</h2>
              <button
                onClick={addDoctor}
                className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-medium"
              >
                + Agregar Doctor
              </button>
            </div>
            <div className="space-y-3">
              {doctors.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div>
                    <span className="font-medium">{doc.name}</span>
                    <span
                      className={`ml-3 px-2 py-0.5 rounded-full text-xs font-medium ${
                        doc.status === "available"
                          ? "bg-green-100 text-green-800"
                          : "bg-red-100 text-red-800"
                      }`}
                    >
                      {doc.status === "available" ? "Disponible" : "Ocupado"}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => toggleDoctorStatus(doc.id, doc.status)}
                      className="px-3 py-1 text-sm border rounded hover:bg-gray-50"
                    >
                      Cambiar estado
                    </button>
                    <button
                      onClick={() => deleteDoctor(doc.id)}
                      className="px-3 py-1 text-sm text-red-600 border border-red-200 rounded hover:bg-red-50"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "servicios" && (
          <div className="bg-white rounded-xl shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Gestión de Servicios</h2>
              <button
                onClick={addService}
                className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-medium"
              >
                + Agregar Servicio
              </button>
            </div>
            <div className="space-y-3">
              {services.map((serv) => (
                <div
                  key={serv.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div>
                    <span className="font-medium">{serv.name}</span>
                    <span className="ml-3 text-green-700 font-semibold">
                      L. {serv.price.toFixed(2)}
                    </span>
                  </div>
                  <button
                    onClick={() => toggleServiceActive(serv.id, serv.active)}
                    className={`px-3 py-1 text-sm rounded ${
                      serv.active
                        ? "bg-green-100 text-green-700 hover:bg-green-200"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {serv.active ? "Activo" : "Inactivo"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
