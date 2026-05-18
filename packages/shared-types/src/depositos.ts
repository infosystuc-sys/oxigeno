export interface Deposito {
  cod_sucurs: string;
  nombre_suc: string;
}

export interface ItemMovimientoDeposito {
  cod_articu: string;
  series:     string[];
}

export interface PostMovimientoDepositoPayload {
  cod_origen:  string;
  cod_destino: string;
  fecha:       string;   // YYYY-MM-DD
  items:       ItemMovimientoDeposito[];
}

export interface MovimientoDepositoResponse {
  success:         boolean;
  nro_comprobante: string;
  message:         string;
}
