export interface Proveedor {
  cod_provee: string;
  NOM_PROVEE: string;
}

export interface GetProveedoresQuery {
  search?: string;
}
