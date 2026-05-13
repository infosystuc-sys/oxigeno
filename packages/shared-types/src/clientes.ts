export interface Cliente {
  cod_client:  string;
  RAZON_SOCI:  string;
}

export interface PostRemitoClientePayload {
  cod_client: string;
  nro_remito: string;
  fecha:       string; // 'YYYY-MM-DD'
  items:       ItemRemitoCliente[];
}

export interface ItemRemitoCliente {
  cod_articu: string;
  series:     string[];
}

export interface RemitoClienteResponse {
  success:          boolean;
  nro_comprobante?: string;
  message?:         string;
}
