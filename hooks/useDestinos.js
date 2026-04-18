/**
 * Estado y llamadas API para el módulo NSFW_Destinos / cuentas terceros.
 */

import { useState, useCallback } from 'react';
import { getDestinos as fetchDestinosApi } from './useTransferAPI';

const apiFetch = async (path, options = {}) => {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error HTTP ${res.status}`);
  return data;
};

export function useDestinos() {
  const [destinos, setDestinos] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchDestinos = useCallback(async (filtros = {}) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchDestinosApi(filtros);
      setDestinos(data.items || []);
      setTotal(data.total ?? (data.items?.length ?? 0));
      return data;
    } catch (e) {
      setError(e.message || 'Error al cargar destinos');
      setDestinos([]);
      setTotal(0);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDestinoById = useCallback(async (id, { incluirCuentas = true } = {}) => {
    const idNum = Number(id);
    if (!Number.isInteger(idNum) || idNum <= 0) {
      throw new Error('ID de destino inválido');
    }
    const q = incluirCuentas ? '' : '?incluir_cuentas=false';
    const data = await apiFetch(`/api/destinos/${idNum}${q}`);
    if (data && data.destino == null && data.Destino != null) data.destino = data.Destino;
    return data;
  }, []);

  const createDestino = useCallback(async (data) => {
    const res = await apiFetch('/api/destinos', { method: 'POST', body: JSON.stringify(data) });
    return res.item;
  }, []);

  const updateDestino = useCallback(async (id, data) => {
    const idNum = Number(id);
    if (!Number.isInteger(idNum) || idNum <= 0) {
      throw new Error('ID de destino inválido');
    }
    const res = await apiFetch(`/api/destinos/${idNum}`, { method: 'PUT', body: JSON.stringify(data) });
    return res.item;
  }, []);

  const softDeleteDestino = useCallback(async (id) => apiFetch(`/api/destinos/${id}`, { method: 'DELETE' }), []);

  const hardDeleteDestino = useCallback(async (id) => {
    const idNum = Number(id);
    if (!Number.isInteger(idNum) || idNum <= 0) throw new Error('ID de destino inválido');
    return apiFetch(`/api/destinos/${idNum}/permanente`, { method: 'DELETE' });
  }, []);

  const toggleActivarDestino = useCallback(
    async (id, activoActual) => {
      if (activoActual) {
        return softDeleteDestino(id);
      }
      const d = await fetchDestinoById(id, { incluirCuentas: false });
      const row = d.destino;
      if (!row) throw new Error('Destino no encontrado');
      const {
        destinos, tipo, razon_social, cuit, codigo_proveedor_tango,
        banco, tipo_cuenta, numero_cuenta, cbu, alias_cbu, observaciones,
      } = row;
      return updateDestino(id, {
        destinos,
        tipo,
        razon_social,
        cuit,
        codigo_proveedor_tango,
        banco,
        tipo_cuenta,
        numero_cuenta,
        cbu,
        alias_cbu,
        observaciones,
        activo: true,
      });
    },
    [fetchDestinoById, updateDestino, softDeleteDestino]
  );

  const fetchCuentasTerceros = useCallback(async (destinoId, incluirInactivas = false) => {
    const q = incluirInactivas ? '?incluir_inactivas=true' : '';
    return apiFetch(`/api/destinos/${destinoId}/cuentas-terceros${q}`);
  }, []);

  const createCuentaTercera = useCallback(async (destinoId, data) => {
    const res = await apiFetch(`/api/destinos/${destinoId}/cuentas-terceros`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.item;
  }, []);

  const updateCuentaTercera = useCallback(async (destinoId, cuentaId, data) => {
    const res = await apiFetch(`/api/destinos/${destinoId}/cuentas-terceros/${cuentaId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return res.item;
  }, []);

  const toggleActivarCuentaTercera = useCallback(async (destinoId, cuentaId, activoActual) => {
    return updateCuentaTercera(destinoId, cuentaId, { activo: !activoActual });
  }, [updateCuentaTercera]);

  const softDeleteCuentaTercera = useCallback(
    async (destinoId, cuentaId) =>
      apiFetch(`/api/destinos/${destinoId}/cuentas-terceros/${cuentaId}`, { method: 'DELETE' }),
    []
  );

  return {
    destinos,
    total,
    loading,
    error,
    setError,
    fetchDestinos,
    fetchDestinoById,
    createDestino,
    updateDestino,
    toggleActivarDestino,
    softDeleteDestino,
    hardDeleteDestino,
    fetchCuentasTerceros,
    createCuentaTercera,
    updateCuentaTercera,
    toggleActivarCuentaTercera,
    softDeleteCuentaTercera,
  };
}

export default useDestinos;
