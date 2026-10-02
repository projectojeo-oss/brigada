"use client";

import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <h1 className="text-4xl font-bold text-blue-800 mb-2">
        Brigada Odontológica
      </h1>
      <p className="text-gray-600 mb-8 text-lg">Sistema de Gestión de Cola</p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 max-w-4xl w-full">
        <Link
          href="/registro"
          className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl p-6 text-center transition-colors"
        >
          <div className="text-3xl mb-2">📝</div>
          <div className="text-xl font-semibold">Registro</div>
          <div className="text-sm opacity-80 mt-1">
            Ingresar pacientes
          </div>
        </Link>

        <Link
          href="/asistente"
          className="bg-green-600 hover:bg-green-700 text-white rounded-xl p-6 text-center transition-colors"
        >
          <div className="text-3xl mb-2">🩺</div>
          <div className="text-xl font-semibold">Asistente</div>
          <div className="text-sm opacity-80 mt-1">
            Atender pacientes
          </div>
        </Link>

        <Link
          href="/cobros"
          className="bg-amber-600 hover:bg-amber-700 text-white rounded-xl p-6 text-center transition-colors"
        >
          <div className="text-3xl mb-2">💰</div>
          <div className="text-xl font-semibold">Cobros</div>
          <div className="text-sm opacity-80 mt-1">
            Procesar pagos
          </div>
        </Link>

        <Link
          href="/admin"
          className="bg-purple-600 hover:bg-purple-700 text-white rounded-xl p-6 text-center transition-colors"
        >
          <div className="text-3xl mb-2">📊</div>
          <div className="text-xl font-semibold">Admin</div>
          <div className="text-sm opacity-80 mt-1">
            Reportes y gestión
          </div>
        </Link>
      </div>

      <Link
        href="/cola"
        className="mt-6 text-blue-600 hover:text-blue-800 underline"
      >
        Ver cola en pantalla grande →
      </Link>
    </div>
  );
}
