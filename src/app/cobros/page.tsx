"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { Patient, AttendedService, Payment } from "@/lib/types";

interface AttendedPatient extends Patient {
  attended_services: AttendedService[];
  payment?: Payment | null;
}

export default function CobrosPage() {
  const [patients, setPatients] = useState<AttendedPatient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<AttendedPatient | null>(null);
  const [amountPaid, setAmountPaid] = useState("");
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  const fetchAttendedPatients = useCallback(async () => {
    const { data } = await supabase
      .from("patients")
      .select("*, attended_services(*, service:services(*)), payment:payments(*)")
      .eq("status", "attended")
      .order("queue_number", { ascending: true });

    if (data) {
      const mapped = data.map((p: any) => ({
        ...p,
        payment: p.payment?.[0] || null,
      }));
      setPatients(mapped);
    }
  }, []);

  useEffect(() => {
    fetchAttendedPatients();

    const channel = supabase
      .channel("cobros-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "patients" }, () => {
        fetchAttendedPatients();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, () => {
        fetchAttendedPatients();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "attended_services" }, () => {
        fetchAttendedPatients();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchAttendedPatients]);

  const totalForPatient = (patient: AttendedPatient) => {
    return patient.attended_services.reduce(
      (sum, s) => sum + (s.service?.price || 0),
      0
    );
  };

  const processPayment = async () => {
    if (!selectedPatient) return;

    const total = totalForPatient(selectedPatient);
    const paid = parseFloat(amountPaid);

    if (isNaN(paid) || paid < total) {
      alert("La cantidad pagada debe ser mayor o igual al total");
      return;
    }

    setLoading(true);

    const change = paid - total;

    const { error } = await supabase.from("payments").insert({
      patient_id: selectedPatient.id,
      total,
      amount_paid: paid,
      change_amount: change,
    });

    if (!error) {
      await supabase
        .from("patients")
        .update({ status: "paid" })
        .eq("id", selectedPatient.id);

      setSelectedPatient(null);
      setAmountPaid("");
    } else {
      alert("Error al procesar pago: " + error.message);
    }

    setLoading(false);
  };

  const filteredPatients = patients.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.queue_number.toString().includes(search)
  );

  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-amber-800">Panel de Cobros</h1>
          <a href="/" className="text-blue-600 hover:underline text-sm">← Inicio</a>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Pacientes por Cobrar</h2>
              <span className="bg-amber-100 text-amber-800 px-3 py-1 rounded-full text-sm font-medium">
                {patients.length} pendientes
              </span>
            </div>

            <input
              type="text"
              placeholder="Buscar por nombre o número..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 mb-4 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
            />

            <div className="space-y-3 max-h-[60vh] overflow-y-auto">
              {filteredPatients.map((p) => {
                const total = totalForPatient(p);
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPatient(p)}
                    className={`w-full text-left p-4 rounded-lg border transition-colors ${
                      selectedPatient?.id === p.id
                        ? "border-amber-500 bg-amber-50"
                        : "border-gray-200 hover:border-amber-300 hover:bg-amber-50/50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-medium">#{p.queue_number} - {p.name}</span>
                        <span className="text-sm text-gray-500 ml-2">
                          {p.attended_services.length} servicio(s)
                        </span>
                      </div>
                      <span className="text-lg font-bold text-green-700">
                        L. {total.toFixed(2)}
                      </span>
                    </div>
                  </button>
                );
              })}
              {filteredPatients.length === 0 && (
                <p className="text-gray-400 text-center py-8">
                  No hay pacientes pendientes de cobro
                </p>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Procesar Pago</h2>

            {selectedPatient ? (
              <div className="space-y-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="font-semibold text-lg">{selectedPatient.name}</h3>
                  <p className="text-sm text-gray-500">
                    #{selectedPatient.queue_number} · {selectedPatient.age} años
                  </p>
                </div>

                <div>
                  <h4 className="font-medium mb-2">Servicios realizados:</h4>
                  <div className="space-y-2">
                    {selectedPatient.attended_services.map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center justify-between p-2 bg-green-50 rounded"
                      >
                        <span>{s.service?.name}</span>
                        <span className="font-medium text-green-700">
                          L. {s.service?.price.toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border-t pt-4">
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-lg font-semibold">Total a pagar:</span>
                    <span className="text-2xl font-bold text-green-700">
                      L. {totalForPatient(selectedPatient).toFixed(2)}
                    </span>
                  </div>

                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Cantidad recibida (L.)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={amountPaid}
                      onChange={(e) => setAmountPaid(e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                      placeholder="0.00"
                    />
                  </div>

                  {amountPaid && parseFloat(amountPaid) >= totalForPatient(selectedPatient) && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-blue-800">Cambio a entregar:</span>
                        <span className="text-2xl font-bold text-blue-700">
                          L. {(parseFloat(amountPaid) - totalForPatient(selectedPatient)).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={processPayment}
                    disabled={loading || !amountPaid || parseFloat(amountPaid) < totalForPatient(selectedPatient)}
                    className="w-full bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white font-semibold py-3 rounded-lg transition-colors"
                  >
                    {loading ? "Procesando..." : "Confirmar Cobro"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-gray-400">
                <p className="text-4xl mb-2">👈</p>
                <p>Selecciona un paciente para procesar el cobro</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
