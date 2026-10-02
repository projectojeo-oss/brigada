"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { Patient, Doctor } from "@/lib/types";

export default function ColaPage() {
  const [waitingPatients, setWaitingPatients] = useState<Patient[]>([]);
  const [inProgressPatients, setInProgressPatients] = useState<(Patient & { assigned_doctor?: Doctor | null })[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());

  const fetchData = useCallback(async () => {
    const [{ data: waiting }, { data: inProgress }, { data: docData }] = await Promise.all([
      supabase
        .from("patients")
        .select("*")
        .eq("status", "waiting")
        .order("queue_number", { ascending: true })
        .limit(20),
      supabase
        .from("patients")
        .select("*, assigned_doctor:doctors(*)")
        .eq("status", "in_progress")
        .order("queue_number", { ascending: true }),
      supabase.from("doctors").select("*").order("name"),
    ]);

    setWaitingPatients(waiting || []);
    setInProgressPatients((inProgress as any) || []);
    setDoctors(docData || []);
  }, []);

  useEffect(() => {
    fetchData();

    const interval = setInterval(() => setCurrentTime(new Date()), 1000);

    const channel = supabase
      .channel("cola-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "patients" }, fetchData)
      .on("postgres_changes", { event: "*", schema: "public", table: "doctors" }, fetchData)
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [fetchData]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 to-blue-700 p-6 text-white">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8 relative">
          <Link
            href="/"
            className="absolute top-0 left-0 bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-lg text-sm transition-colors"
          >
            ← Volver al Sistema
          </Link>
          <h1 className="text-4xl font-bold mb-2">Brigada Odontológica</h1>
          <p className="text-blue-200 text-xl">
            {currentTime.toLocaleDateString("es-HN", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
          <p className="text-blue-300 text-2xl font-mono mt-1">
            {currentTime.toLocaleTimeString("es-HN")}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white/10 backdrop-blur rounded-2xl p-6">
            <h2 className="text-2xl font-bold mb-4 text-center">
              En Atención
            </h2>
            <div className="space-y-4">
              {inProgressPatients.map((p) => (
                <div
                  key={p.id}
                  className="bg-white/20 rounded-xl p-4 text-center"
                >
                  <div className="text-3xl font-bold">#{p.queue_number}</div>
                  <div className="text-xl font-semibold">{p.name}</div>
                  <div className="text-blue-200 mt-1">
                    con {p.assigned_doctor?.name || "doctor asignado"}
                  </div>
                </div>
              ))}
              {inProgressPatients.length === 0 && (
                <p className="text-center text-blue-200 py-8">
                  No hay pacientes en atención
                </p>
              )}
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur rounded-2xl p-6">
            <h2 className="text-2xl font-bold mb-4 text-center">
              Siguientes en Espera
            </h2>
            <div className="space-y-3">
              {waitingPatients.slice(0, 10).map((p, i) => (
                <div
                  key={p.id}
                  className={`flex items-center gap-4 p-3 rounded-xl ${
                    i === 0 ? "bg-yellow-400/30" : "bg-white/10"
                  }`}
                >
                  <div className="text-2xl font-bold w-12 text-center">
                    #{p.queue_number}
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold">{p.name}</div>
                    <div className="text-sm text-blue-200">
                      {p.age} años
                    </div>
                  </div>
                  {i === 0 && (
                    <span className="bg-yellow-400 text-yellow-900 px-3 py-1 rounded-full text-sm font-bold">
                      Siguiente
                    </span>
                  )}
                </div>
              ))}
              {waitingPatients.length === 0 && (
                <p className="text-center text-blue-200 py-8">
                  No hay pacientes en espera
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 text-center">
          <div className="inline-flex gap-4 flex-wrap justify-center">
            {doctors.map((doc) => (
              <div
                key={doc.id}
                className={`px-4 py-2 rounded-full text-sm font-medium ${
                  doc.status === "available"
                    ? "bg-green-400/30 text-green-100"
                    : "bg-red-400/30 text-red-100"
                }`}
              >
                {doc.name}: {doc.status === "available" ? "Disponible" : "Ocupado"}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
