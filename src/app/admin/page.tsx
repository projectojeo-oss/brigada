"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { Doctor, Service, Patient, AttendedService, Payment } from "@/lib/types";

interface ReportPatient extends Patient {
  attended_services: AttendedService[];
  payment?: Payment | null;
}

const ADMIN_PASSWORD = "brigada2024";

export default function AdminPage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState(false);
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
        .select("*, attended_services(*, service:services(*), doctor:doctors(*)), payment:payments(*)")
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
    if (filters.gender && p.gender !== filters.gender) return false;
    if (filters.ageMin && p.age < parseInt(filters.ageMin)) return false;
    if (filters.ageMax && p.age > parseInt(filters.ageMax)) return false;
    if (filters.status && p.status !== filters.status) return false;
    if (filters.dateFrom && new Date(p.created_at) < new Date(filters.dateFrom)) return false;
    if (filters.dateTo && new Date(p.created_at) > new Date(filters.dateTo + "T23:59:59")) return false;
    return true;
  });

  interface ReportRow {
    patient: ReportPatient;
    svc: AttendedService | null;
  }

  const reportRows: ReportRow[] = [];
  for (const p of filteredPatients) {
    let svcs = p.attended_services;
    if (filters.doctor) svcs = svcs.filter((s) => s.doctor_id === filters.doctor);
    if (filters.service) svcs = svcs.filter((s) => s.service_id === filters.service);
    const rowFiltering = !!(filters.doctor || filters.service);
    if (svcs.length === 0) {
      if (!rowFiltering && p.attended_services.length === 0) reportRows.push({ patient: p, svc: null });
      continue;
    }
    for (const svc of svcs) reportRows.push({ patient: p, svc });
  }

  const summaryPatients = new Map<string, ReportPatient>();
  for (const r of reportRows) summaryPatients.set(r.patient.id, r.patient);
  const totalRevenue = Array.from(summaryPatients.values()).reduce(
    (sum, p) => sum + (p.payment?.total || 0),
    0
  );

  const genderLabel = (g: string) => (g === "M" ? "Masculino" : g === "F" ? "Femenino" : "Otro");

  const statusLabel = (s: string) =>
    s === "waiting" ? "En espera" : s === "in_progress" ? "En atención" : s === "attended" ? "Atendido" : s === "cancelled" ? "Cancelado" : "Pagado";

  interface DoctorGroup {
    label: string;
    rows: ReportRow[];
  }

  const groupRowsByDoctor = (rows: ReportRow[]): DoctorGroup[] => {
    const map = new Map<string, DoctorGroup>();
    for (const r of rows) {
      const label = r.svc?.doctor?.name || "(Sin doctor asignado)";
      if (!map.has(label)) map.set(label, { label, rows: [] });
      map.get(label)!.rows.push(r);
    }
    return Array.from(map.values()).sort((a, b) => {
      if (a.label === "(Sin doctor asignado)") return 1;
      if (b.label === "(Sin doctor asignado)") return -1;
      return a.label.localeCompare(b.label);
    });
  };

  const exportCSV = () => {
    const esc = (c: unknown) => `"${String(c ?? "")}"`;
    const groups = groupRowsByDoctor(reportRows);
    const lines: string[] = [];
    for (const g of groups) {
      lines.push([esc("Encargado"), esc(g.label)].join(","));
      lines.push(
        ["Cola", "Nombre", "Edad", "Género", "Servicio", "Estado", "Total", "Fecha"].map(esc).join(",")
      );
      const seen = new Set<string>();
      for (const r of g.rows) {
        const p = r.patient;
        const first = !seen.has(p.id);
        seen.add(p.id);
        lines.push(
          [
            p.queue_number,
            p.name,
            p.age,
            genderLabel(p.gender),
            r.svc?.service?.name || "-",
            statusLabel(p.status),
            first && p.payment ? p.payment.total.toFixed(2) : "",
            new Date(p.created_at).toLocaleString("es-HN"),
          ]
            .map(esc)
            .join(",")
        );
      }
      lines.push("");
    }
    const csv = lines.join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reporte_brigada_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  };

  const exportPDF = () => {
    const groups = groupRowsByDoctor(reportRows);
    const win = window.open("", "_blank");
    if (!win) return;

    const groupHtml = groups
      .map((g) => {
        const seen = new Set<string>();
        const tableRows = g.rows
          .map((r) => {
            const p = r.patient;
            const first = !seen.has(p.id);
            seen.add(p.id);
            return `
      <tr>
        <td>${p.queue_number}</td>
        <td>${p.name}</td>
        <td>${p.age}</td>
        <td>${p.gender === "M" ? "Masc." : p.gender === "F" ? "Fem." : "Otro"}</td>
        <td>${r.svc?.service?.name || "-"}</td>
        <td>${statusLabel(p.status)}</td>
        <td style="font-weight:600;">${first && p.payment ? "L. " + p.payment.total.toFixed(2) : "-"}</td>
      </tr>`;
          })
          .join("");
        return `
        <div class="group">
          <h2>Encargado: ${g.label}</h2>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Nombre</th>
                <th>Edad</th>
                <th>Género</th>
                <th>Servicio</th>
                <th>Estado</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
        </div>`;
      })
      .join("");

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
          .group { margin-bottom: 28px; page-break-inside: avoid; }
          .group h2 { color: #1e40af; font-size: 16px; margin-bottom: 8px; border-left: 4px solid #1e40af; padding-left: 8px; }
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
          <strong>${summaryPatients.size}</strong> pacientes · Ingresos totales: <strong>L. ${totalRevenue.toFixed(2)}</strong>
        </div>
        ${groupHtml}
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

  const editService = async (id: string, currentName: string, currentPrice: number) => {
    const name = prompt("Nombre del servicio:", currentName);
    if (!name) return;
    const price = prompt("Precio (L.):", currentPrice.toString());
    if (!price) return;
    await supabase.from("services").update({ name, price: parseFloat(price) }).eq("id", id);
    fetchData();
  };

  const deleteService = async (id: string, name: string) => {
    if (!confirm(`¿Eliminar el servicio "${name}"?`)) return;
    await supabase.from("services").delete().eq("id", id);
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

  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="bg-white rounded-xl shadow p-8 max-w-sm w-full">
          <h2 className="text-xl font-bold text-purple-800 mb-4 text-center">Acceso restringido</h2>
          <p className="text-sm text-gray-600 mb-4 text-center">Ingresa la contraseña de administrador</p>
          <form onSubmit={(e) => {
            e.preventDefault();
            if (passwordInput === ADMIN_PASSWORD) {
              setAuthenticated(true);
              setPasswordError(false);
            } else {
              setPasswordError(true);
            }
          }}>
            <input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder="Contraseña"
              className="w-full border rounded-lg px-3 py-2 mb-3 focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            />
            {passwordError && (
              <p className="text-red-600 text-sm mb-3">Contraseña incorrecta</p>
            )}
            <button type="submit" className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 rounded-lg transition-colors">
              Entrar
            </button>
          </form>
        </div>
      </div>
    );
  }

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
                  <label className="block text-sm text-gray-600 mb-1">Doctor que atendió</label>
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
                    {summaryPatients.size} pacientes · Ingresos totales:{" "}
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
                      <th className="text-left py-2 px-2">Servicio</th>
                      <th className="text-left py-2 px-2">Estado</th>
                      <th className="text-right py-2 px-2">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportRows.slice(0, 100).map((r, i) => {
                      const p = r.patient;
                      const firstRow = i === 0 || reportRows[i - 1].patient.id !== p.id;
                      return (
                        <tr key={`${p.id}-${r.svc?.id || "none"}`} className="border-b hover:bg-gray-50">
                          <td className="py-2 px-2">{p.queue_number}</td>
                          <td className="py-2 px-2 font-medium">{p.name}</td>
                          <td className="py-2 px-2">{p.age}</td>
                          <td className="py-2 px-2">{p.gender === "M" ? "Masc." : p.gender === "F" ? "Fem." : "Otro"}</td>
                          <td className="py-2 px-2">{r.svc?.doctor?.name || "-"}</td>
                          <td className="py-2 px-2">{r.svc?.service?.name || "-"}</td>
                          <td className="py-2 px-2">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.status === "waiting" ? "bg-yellow-100 text-yellow-800" : p.status === "in_progress" ? "bg-blue-100 text-blue-800" : p.status === "attended" ? "bg-green-100 text-green-800" : p.status === "cancelled" ? "bg-red-100 text-red-800" : "bg-gray-100 text-gray-800"}`}>
                              {statusLabel(p.status)}
                            </span>
                          </td>
                          <td className="py-2 px-2 text-right font-medium">
                            {firstRow && p.payment ? `L. ${p.payment.total.toFixed(2)}` : "-"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {reportRows.length > 100 && (
                  <p className="text-center text-sm text-gray-400 py-2">
                    Mostrando 100 de {reportRows.length} registros (pacientes con varios servicios aparecen más de una vez). Exporta CSV o PDF para ver todos.
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
                  <div className="flex gap-2">
                    <button
                      onClick={() => editService(serv.id, serv.name, serv.price)}
                      className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => toggleServiceActive(serv.id, serv.active)}
                      className={`px-3 py-1 text-sm rounded ${serv.active ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                    >
                      {serv.active ? "Activo" : "Inactivo"}
                    </button>
                    <button
                      onClick={() => deleteService(serv.id, serv.name)}
                      className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200"
                    >
                      Eliminar
                    </button>
                  </div>
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
