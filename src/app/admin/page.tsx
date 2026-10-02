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
  const [activeTab, setActiveTab] = useState<"reportes" | "doctores" | "servicios" | "eliminar">("reportes");

  const [filters, setFilters] = useState({
    doctor: "",
    service: "",
    gender: "",
    ageMin: "",
    ageMax: "",
    status: "",
    dateFrom: "",
    dateTo: "",
  });

  const [deleteSearch, setDeleteSearch] = useState("");

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
    if (filters.doctor && p.assigned_doctor_id !== filters.doctor) return false;
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

  const totalRevenue = filteredPatients.reduce((sum, p) => sum + (p.payment?.total || 0), 0);

  const statusLabel = (s: string) =>
    s === "waiting" ? "En espera" : s === "in_progress" ? "En atención" : s === "attended" ? "Atendido" : s === "cancelled" ? "Cancelado" : "Pagado";

  const exportCSV = () => {
    const headers = ["Cola", "Nombre", "Edad", "Género", "Doctor", "Estado", "Servicios", "Total", "Pagado", "Cambio", "Fecha"];
    const rows = filteredPatients.map((p) => [
      p.queue_number,
      p.name,
      p.age,
      p.gender === "M" ? "Masculino" : p.gender === "F" ? "Femenino" : "Otro",
      p.assigned_doctor?.name || "",
      statusLabel(p.status),
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

  const exportPDF = () => {
    const filtered = filteredPatients;
    const win = window.open("", "_blank");
    if (!win) return;

    const tableRows = filtered.map((p) => `
      <tr>
        <td>${p.queue_number}</td>
        <td>${p.name}</td>
        <td>${p.age}</td>
        <td>${p.gender === "M" ? "Masc." : p.gender === "F" ? "Fem." : "Otro"}</td>
        <td>${p.assigned_doctor?.name || "-"}</td>
        <td>${statusLabel(p.status)}</td>
        <td style="font-size:10px;">${p.attended_services.map((s) => s.service?.name).join(", ") || "-"}</td>
        <td style="font-weight:600;">L. ${(p.payment?.total || 0).toFixed(2)}</td>
      </tr>
    `).join("");

    win.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Reporte Brigada Odontológica</title>
        <style>
          body { font-family: system-ui, sans-serif; padding: 40px; color: #1f2937; }
          .header { text-align: center; margin-bottom: 30px; border-bottom: 3px solid #1e40af; padding-bottom: 20px; }
          .header h1 { color: #1e40af; font-size: 24px; margin-bottom: 8px; }
          .header p { color: #6b7280; font-size: 14px; }
          .summary { background: #eff6ff; border-radius: 8px; padding: 16px; margin-bottom: 20px; text-align: center; }
          .summary strong { color: #1e40af; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th { background: #1e40af; color: white; padding: 10px 8px; text-align: left; }
          td { padding: 8px; border-bottom: 1px solid #e5e7eb; }
          tr:nth-child(even) { background: #f9fafb; }
          .footer { margin-top: 30px; text-align: center; color: #9ca3af; font-size: 11px; }
          @media print { body { padding: 20px; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Brigada Odontológica</h1>
          <p>Reporte de Atención - ${new Date().toLocaleDateString("es-HN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
          <p>Generado: ${new Date().toLocaleTimeString("es-HN")}</p>
        </div>
        <div class="summary">
          <strong>${filtered.length}</strong> pacientes · Ingresos totales: <strong>L. ${filtered.reduce((s, p) => s + (p.payment?.total || 0), 0).toFixed(2)}</strong>
        </div>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Nombre</th>
              <th>Edad</th>
              <th>Género</th>
              <th>Doctor</th>
              <th>Estado</th>
              <th>Servicios</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
        <div class="footer">
          Sistema de Gestión de Cola - Brigada Odontológica
        </div>
      </body>
      </html>
    `);
    win.document.close();
    setTimeout(() => win.print(), 500);
  };

  const addDoctor = async () => {
    const name = prompt("Nombre del doctor:");
    if (!name) return;
    await supabase.from("doctors").insert({ name });
    fetchData();
  };

  const toggleDoctorStatus = async (id: string, currentStatus: string) => {
    await supabase.from("doctors").update({ status: currentStatus === "available" ? "occupied" : "available" }).eq("id", id);
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

  const deletePatientAdmin = async (id: string, name: string) => {
    if (!confirm(`¿Eliminar a ${name}? Esta acción es permanente.`)) return;
    await supabase.from("patients").delete().eq("id", id);
    fetchData();
  };

  const clearAllData = async () => {
    if (!confirm("¿Estás seguro? Se eliminarán TODOS los pacientes, pagos y servicios realizados.")) return;
    if (!confirm("Esta acción es PERMANENTE. ¿Continuar?")) return;
    await supabase.from("patients").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    fetchData();
  };

  const deleteResults = patients.filter(
    (p) =>
      p.name.toLowerCase().includes(deleteSearch.toLowerCase()) ||
      p.queue_number.toString().includes(deleteSearch)
  );

  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-purple-800">Panel de Administración</h1>
          <a href="/" className="text-blue-600 hover:underline text-sm">← Inicio</a>
        </div>

        <div className="flex gap-2 mb-6">
          {(["reportes", "doctores", "servicios", "eliminar"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === tab
                  ? "bg-purple-600 text-white"
                  : "bg-white text-gray-700 hover:bg-gray-100"
              }`}
            >
              {tab === "reportes" ? "Reportes" : tab === "doctores" ? "Doctores" : tab === "servicios" ? "Servicios" : "Eliminar Datos"}
            </button>
          ))}
        </div>

        {activeTab === "reportes" && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow p-6">
              <h2 className="text-lg font-semibold mb-4">Filtros</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Doctor</label>
                  <select value={filters.doctor} onChange={(e) => setFilters({ ...filters, doctor: e.target.value })} className="w-full border rounded-lg px-3 py-2">
                    <option value="">Todos</option>
                    {doctors.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Servicio</label>
                  <select value={filters.service} onChange={(e) => setFilters({ ...filters, service: e.target.value })} className="w-full border rounded-lg px-3 py-2">
                    <option value="">Todos</option>
                    {services.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Género</label>
                  <select value={filters.gender} onChange={(e) => setFilters({ ...filters, gender: e.target.value })} className="w-full border rounded-lg px-3 py-2">
                    <option value="">Todos</option>
                    <option value="M">Masculino</option>
                    <option value="F">Femenino</option>
                    <option value="Otro">Otro</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Edad mín.</label>
                  <input type="number" value={filters.ageMin} onChange={(e) => setFilters({ ...filters, ageMin: e.target.value })} className="w-full border rounded-lg px-3 py-2" placeholder="0" />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Edad máx.</label>
                  <input type="number" value={filters.ageMax} onChange={(e) => setFilters({ ...filters, ageMax: e.target.value })} className="w-full border rounded-lg px-3 py-2" placeholder="120" />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Estado</label>
                  <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} className="w-full border rounded-lg px-3 py-2">
                    <option value="">Todos</option>
                    <option value="waiting">En espera</option>
                    <option value="in_progress">En atención</option>
                    <option value="attended">Atendido</option>
                    <option value="paid">Pagado</option>
                    <option value="cancelled">Cancelado</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Desde</label>
                  <input type="date" value={filters.dateFrom} onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })} className="w-full border rounded-lg px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Hasta</label>
                  <input type="date" value={filters.dateTo} onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })} className="w-full border rounded-lg px-3 py-2" />
                </div>
              </div>
              <button onClick={() => setFilters({ doctor: "", service: "", gender: "", ageMin: "", ageMax: "", status: "", dateFrom: "", dateTo: "" })} className="mt-4 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                Limpiar filtros
              </button>
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
                <div className="flex gap-2">
                  <button onClick={exportCSV} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium transition-colors">
                    Exportar CSV
                  </button>
                  <button onClick={exportPDF} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors">
                    Exportar PDF
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-2">#</th>
                      <th className="text-left py-2 px-2">Nombre</th>
                      <th className="text-left py-2 px-2">Edad</th>
                      <th className="text-left py-2 px-2">Género</th>
                      <th className="text-left py-2 px-2">Doctor</th>
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
                        <td className="py-2 px-2">{p.gender === "M" ? "Masc." : p.gender === "F" ? "Fem." : "Otro"}</td>
                        <td className="py-2 px-2">{p.assigned_doctor?.name || "-"}</td>
                        <td className="py-2 px-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.status === "waiting" ? "bg-yellow-100 text-yellow-800" : p.status === "in_progress" ? "bg-blue-100 text-blue-800" : p.status === "attended" ? "bg-green-100 text-green-800" : p.status === "cancelled" ? "bg-red-100 text-red-800" : "bg-gray-100 text-gray-800"}`}>
                            {statusLabel(p.status)}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-xs">{p.attended_services.map((s) => s.service?.name).join(", ") || "-"}</td>
                        <td className="py-2 px-2 text-right font-medium">L. {(p.payment?.total || 0).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredPatients.length > 100 && (
                  <p className="text-center text-sm text-gray-400 py-2">
                    Mostrando 100 de {filteredPatients.length} resultados. Exporta CSV o PDF para ver todos.
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
              <button onClick={addDoctor} className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-medium">
                + Agregar Doctor
              </button>
            </div>
            <div className="space-y-3">
              {doctors.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <span className="font-medium">{doc.name}</span>
                    <span className={`ml-3 px-2 py-0.5 rounded-full text-xs font-medium ${doc.status === "available" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                      {doc.status === "available" ? "Disponible" : "Ocupado"}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => toggleDoctorStatus(doc.id, doc.status)} className="px-3 py-1 text-sm border rounded hover:bg-gray-50">
                      Cambiar estado
                    </button>
                    <button onClick={() => deleteDoctor(doc.id)} className="px-3 py-1 text-sm text-red-600 border border-red-200 rounded hover:bg-red-50">
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
              <button onClick={addService} className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-medium">
                + Agregar Servicio
              </button>
            </div>
            <div className="space-y-3">
              {services.map((serv) => (
                <div key={serv.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <span className="font-medium">{serv.name}</span>
                    <span className="ml-3 text-green-700 font-semibold">L. {serv.price.toFixed(2)}</span>
                  </div>
                  <button
                    onClick={() => toggleServiceActive(serv.id, serv.active)}
                    className={`px-3 py-1 text-sm rounded ${serv.active ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                  >
                    {serv.active ? "Activo" : "Inactivo"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "eliminar" && (
          <div className="space-y-6">
            <div className="bg-red-50 border border-red-200 rounded-xl p-6">
              <h2 className="text-lg font-semibold text-red-800 mb-2">Zona de peligro</h2>
              <p className="text-sm text-red-600">Estas acciones son permanentes y no se pueden deshacer.</p>
            </div>

            <div className="bg-white rounded-xl shadow p-6">
              <h2 className="text-lg font-semibold mb-4">Eliminar paciente</h2>
              <div className="mb-4">
                <input
                  type="text"
                  placeholder="Buscar por nombre o número de cola..."
                  value={deleteSearch}
                  onChange={(e) => setDeleteSearch(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-red-500 focus:border-red-500"
                />
              </div>
              <div className="space-y-3">
                {deleteResults.slice(0, 10).map((p) => (
                  <div key={p.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <span className="font-medium">#{p.queue_number} - {p.name}</span>
                      <span className="text-sm text-gray-500 ml-2">{statusLabel(p.status)}</span>
                    </div>
                    <button onClick={() => deletePatientAdmin(p.id, p.name)} className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 text-sm rounded">
                      Eliminar
                    </button>
                  </div>
                ))}
                {deleteResults.length === 0 && (
                  <p className="text-gray-400 text-center py-4">Sin resultados</p>
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl shadow p-6">
              <h2 className="text-lg font-semibold mb-4">Limpiar base de datos</h2>
              <p className="text-sm text-gray-600 mb-4">Elimina todos los pacientes, pagos y servicios realizados. Útil para datos de prueba.</p>
              <button onClick={clearAllData} className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg font-medium">
                Eliminar TODA la base de datos
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
