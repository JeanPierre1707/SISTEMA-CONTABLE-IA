const { XMLParser } = require("fast-xml-parser");

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true
});

function obtenerArray(valor) {
  if (!valor) return [];
  return Array.isArray(valor) ? valor : [valor];
}

function obtenerTexto(valor) {
  if (valor === undefined || valor === null) return "";
  if (typeof valor === "object" && "#text" in valor) {
    return String(valor["#text"]);
  }
  return String(valor);
}

function extraerComprobante(xml) {
  const documento = parser.parse(xml);
  const invoice = documento.Invoice;

  if (!invoice) {
    throw new Error("El XML no contiene un comprobante Invoice válido.");
  }

  const supplierParty = invoice.AccountingSupplierParty?.Party;

  const ruc = obtenerTexto(
    supplierParty?.PartyIdentification?.ID
  );

  const proveedor = obtenerTexto(
    supplierParty?.PartyName?.Name ||
    supplierParty?.PartyLegalEntity?.RegistrationName
  );

  const idComprobante = obtenerTexto(invoice.ID);

  const partesID = idComprobante.split("-");

  const serie = partesID[0] || "";
  const numero = partesID.slice(1).join("-") || "";

  const tipoCodigo = obtenerTexto(invoice.InvoiceTypeCode);

  const tiposDocumento = {
  "1": "Factura",
  "01": "Factura",
  "3": "Boleta de Venta",
  "03": "Boleta de Venta",
  "7": "Nota de Crédito",
  "07": "Nota de Crédito",
  "8": "Nota de Débito",
  "08": "Nota de Débito"
  };

  const tipoDocumento =
    tiposDocumento[tipoCodigo] || tipoCodigo;

  const fecha = obtenerTexto(invoice.IssueDate);

  const taxTotal = invoice.TaxTotal;

  const igv = Number(
    obtenerTexto(taxTotal?.TaxAmount) || 0
  );

  const baseImponible = Number(
    obtenerTexto(
      taxTotal?.TaxSubtotal?.TaxableAmount
    ) || 0
  );

  const total = Number(
    obtenerTexto(
      invoice.LegalMonetaryTotal?.PayableAmount
    ) || 0
  );

  const invoiceLines = obtenerArray(invoice.InvoiceLine);

  const items = invoiceLines.map((linea) => {

    const item = linea.Item;

    const descripcion = obtenerTexto(
      item?.Description
    ).split("~~~")[0].trim();

    const cantidad = Number(
      obtenerTexto(linea.InvoicedQuantity) || 0
    );

    const unidad =
      linea.InvoicedQuantity?.["@_unitCode"] || "";

    const base = Number(
      obtenerTexto(linea.LineExtensionAmount) || 0
    );

    const igvLinea = Number(
      obtenerTexto(linea.TaxTotal?.TaxAmount) || 0
    );

    const totalLinea = Number(
      (base + igvLinea).toFixed(2)
    );

    const propiedades = obtenerArray(
      item?.AdditionalItemProperty
    );

    let placa = "—";

    for (const propiedad of propiedades) {

      const nombre = obtenerTexto(propiedad.Name);
      const codigo = obtenerTexto(propiedad.NameCode);
      const valor = obtenerTexto(propiedad.Value);

      if (
        codigo === "7000" ||
        nombre.toLowerCase().includes("número de placa") ||
        nombre.toLowerCase().includes("numero de placa")
      ) {
        if (valor.trim()) {
          placa = valor.trim();
        }
      }
    }

    return {
      descripcion,
      cantidad,
      unidad,
      base,
      igv: igvLinea,
      total: totalLinea,
      placa
    };
  });

  return {
    ruc,
    proveedor,
    tipoDocumento,
    serie,
    numero,
    fecha,
    baseImponible,
    igv,
    total,
    items
  };
}

module.exports = {
  extraerComprobante
};