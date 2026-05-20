// ─── Listado de comprobantes ──────────────────────────────────────────────────

export interface ComprobanteRecepcion {
  id_sta14:          number;
  ncomp_in_s:        string;
  n_comp:            string;
  fecha:             string;
  cod_proveedor:     string;
  nombre_proveedor:  string;
  total_articulos:   number;
  total_series:      number;
}

export interface ComprobanteRemito {
  id_sta14:        number;
  ncomp_in_s:      string;
  n_comp:          string;
  fecha:           string;
  cod_cliente:     string;
  nombre_cliente:  string;
  total_articulos: number;
  total_series:    number;
}

export interface ComprobanteMovimiento {
  id_sta14:        number;
  ncomp_in_s:      string;
  n_comp:          string;
  fecha:           string;
  cod_origen:      string;
  nombre_origen:   string;
  cod_destino:     string;
  nombre_destino:  string;
  total_articulos: number;
  total_series:    number;
}

// ─── Detalle de comprobante ───────────────────────────────────────────────────

export interface DetalleArticulo {
  cod_articu: string;
  descrip:    string;
  series:     string[];
}

export interface ComprobanteDetalle {
  id_sta14: number;
  n_comp:   string;
  items:    DetalleArticulo[];
}

// ─── Trazabilidad de serie ────────────────────────────────────────────────────

export interface MovimientoSerie {
  n_comp:           string;
  tipo_movimiento:  string;
  fecha:            string;
  entidad_cod:      string;
  cod_deposi:       string;
  deposito_nombre:  string;
}

export interface RutaArticulo {
  cod_articu:             string;
  descrip:                string;
  cod_deposi_actual:      string;
  deposito_actual_nombre: string;
  historial:              MovimientoSerie[];
}

export interface TrazabilidadSerie {
  n_serie: string;
  rutas:   RutaArticulo[];
}
