export interface Articulo {
  cod_articu: string;
  descrip: string;
}

export interface ItemRecepcion {
  cod_articu: string;
  series: string[];
}

export interface PostRecepcionPayload {
  cod_provee: string;
  nro_remito: string;
  fecha: string; // 'YYYY-MM-DD'
  items: ItemRecepcion[];
}

export interface RecepcionResponse {
  success: boolean;
  nro_comprobante?: string;
  message?: string;
}

export interface TalonarioResponse {
  /** Número de comprobante próximo a usar, cero-padded a 8 dígitos. Ej: '00004245' */
  proximo: string;
  tipo_comp: string;
}
