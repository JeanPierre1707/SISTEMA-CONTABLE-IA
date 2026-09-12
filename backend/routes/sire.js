const express = require("express");
const axios = require("axios");
require("dotenv").config();

const router = express.Router();

// ==========================================
// PRUEBA DEL MÓDULO SIRE
// ==========================================

router.get("/sire/test", (req, res) => {
    res.json({
        success: true,
        mensaje: "Módulo SIRE conectado correctamente al backend"
    });
});


// ==========================================
// AUTENTICACIÓN SUNAT SIRE
// ==========================================

async function obtenerTokenSunat() {

    const {
        SUNAT_CLIENT_ID,
        SUNAT_CLIENT_SECRET,
        SUNAT_RUC,
        SUNAT_USUARIO_SOL,
        SUNAT_CLAVE_SOL
    } = process.env;

    // Verificar que existan las variables necesarias
    const variables = {
        SUNAT_CLIENT_ID,
        SUNAT_CLIENT_SECRET,
        SUNAT_RUC,
        SUNAT_USUARIO_SOL,
        SUNAT_CLAVE_SOL
    };
    
    const faltantes = Object.entries(variables)
        .filter(([_, valor]) => !valor)
        .map(([nombre]) => nombre);

    if (faltantes.length > 0) {
        throw new Error(
            `Faltan variables de entorno: ${faltantes.join(", ")}`
        );
    }

    // URL oficial de autenticación SUNAT
    const url =
        `https://api-seguridad.sunat.gob.pe/v1/clientessol/` +
        `${SUNAT_CLIENT_ID}/oauth2/token/`;

    // Datos que exige SUNAT
    const datos = new URLSearchParams();

    datos.append("grant_type", "password");
    datos.append("scope", "https://api-sire.sunat.gob.pe");
    datos.append("client_id", SUNAT_CLIENT_ID);
    datos.append("client_secret", SUNAT_CLIENT_SECRET);

    // SUNAT utiliza RUC + Usuario SOL
    datos.append(
    "username",
    `${SUNAT_RUC}${SUNAT_USUARIO_SOL}`
    );

    datos.append("password", SUNAT_CLAVE_SOL);
    console.log("SIRE REQUEST CHECK:", {
    grant_type: datos.get("grant_type"),
    scope: datos.get("scope"),
    client_id_length: datos.get("client_id")?.length,
    client_secret_length: datos.get("client_secret")?.length,
    username_prefix: datos.get("username")?.slice(0, 3),
    username_suffix: datos.get("username")?.slice(-3),
    password_length: datos.get("password")?.length,
    username_has_spaces: /\s/.test(datos.get("username") || ""),
    password_has_spaces: /\s/.test(datos.get("password") || "")
    });

    // Solicitud a SUNAT
    const respuesta = await axios.post(
        url,
        datos.toString(),
        {
            headers: {
                "Content-Type":
                    "application/x-www-form-urlencoded",
                "Accept": "application/json"
            },
            timeout: 20000
        }
    );

    return respuesta.data;
}


// ==========================================
// ENDPOINT PARA PROBAR AUTENTICACIÓN
// ==========================================

router.post("/sire/auth", async (req, res) => {

    try {

        const token = await obtenerTokenSunat();

        res.json({
            success: true,
            mensaje: "Autenticación SIRE exitosa",
            token_type: token.token_type,
            expires_in: token.expires_in
        });

    } catch (error) {

        console.error(
            "Error de autenticación SIRE:",
            error.response?.status || error.message
        );

        console.error(
            "RESPUESTA COMPLETA DE SUNAT:",
              JSON.stringify(error.response?.data, null, 2)
        );

        res.status(500).json({
            success: false,
            mensaje:
                "SUNAT no autorizó la autenticación SIRE. " +
                "Revisa las credenciales API, usuario SOL, " +
                "Clave SOL y permisos de la aplicación."
        });
    }
});

router.get("/sire/periodos-rce", async (req, res) => {
    try {
        const token = await obtenerTokenSunat();

        const respuesta = await axios.get(
            "https://api-sire.sunat.gob.pe/v1/contribuyente/migeigv/libros/rvierce/padron/web/omisos/080000/periodos",
            {
                headers: {
                    Authorization: `Bearer ${token.access_token}`,
                    Accept: "application/json"
                },
                timeout: 20000
            }
        );

        res.json({
            success: true,
            datos: respuesta.data
        });

    } catch (error) {
        console.error(
            "Error consultando períodos RCE:",
            error.response?.status || error.message
        );

        console.error(
            "RESPUESTA SIRE:",
            JSON.stringify(error.response?.data, null, 2)
        );

        res.status(500).json({
            success: false,
            mensaje: "No se pudieron consultar los períodos RCE."
        });
    }
});

router.get("/sire/rce-periodo/:periodo", async (req, res) => {
    try {
        const { periodo } = req.params;

        if (!/^\d{6}$/.test(periodo)) {
            return res.status(400).json({
                success: false,
                mensaje: "El período debe tener formato YYYYMM."
            });
        }

        const token = await obtenerTokenSunat();

        const url =
            `https://api-sire.sunat.gob.pe/v1/contribuyente/migeigv/` +
            `libros/rce/ajustesposteriores/web/ajustesposteriores/` +
            `${periodo}/solicitardescarga`;

        const respuesta = await axios.get(url, {
            params: {
                codTipoArchivo: 0,
                codMoneda: "PEN",
                codProceso: "01",
                codOrigen: "2",
                lisPeriodos: periodo
            },
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Authorization": `Bearer ${token.access_token}`
            },
            timeout: 20000
        });

        res.json({
            success: true,
            periodo,
            ticket: respuesta.data
        });

    } catch (error) {
        console.error(
            "Error solicitando descarga RCE:",
            error.response?.status || error.message
        );

        console.error(
            "RESPUESTA SIRE:",
            JSON.stringify(error.response?.data, null, 2)
        );

        res.status(error.response?.status || 500).json({
             success: false,
             mensaje: "SUNAT rechazó la solicitud.",
             detalle: error.response?.data || error.message
        });
    }
});

router.get("/sire/rce-propuesta/:periodo", async (req, res) => {
    try {
        const { periodo } = req.params;

        if (!/^\d{6}$/.test(periodo)) {
            return res.status(400).json({
                success: false,
                mensaje: "El período debe tener formato YYYYMM."
            });
        }

        const token = await obtenerTokenSunat();

        const url =
            `https://api-sire.sunat.gob.pe/v1/contribuyente/migeigv/` +
            `libros/rce/propuesta/web/propuesta/${periodo}/` +
            `exportacioncomprobantepropuesta`;

        const respuesta = await axios.get(url, {
            params: {
                codTipoArchivo: 0,
                codOrigenEnvio: 2
            },
            headers: {
                "Accept": "application/json",
                "Authorization": `Bearer ${token.access_token}`
            },
            timeout: 20000
        });

        res.json({
            success: true,
            periodo,
            ticket: respuesta.data
        });

    } catch (error) {
        console.error(
            "Error descargando propuesta RCE:",
            error.response?.status || error.message
        );

        console.error(
            "RESPUESTA SIRE:",
            JSON.stringify(error.response?.data, null, 2)
        );

        res.status(error.response?.status || 500).json({
            success: false,
            mensaje: "SUNAT rechazó la descarga de la propuesta.",
            detalle: error.response?.data || error.message
        });
    }
});

router.get("/sire/consulta-ticket/:periodo/:ticket", async (req, res) => {
    try {
        const { periodo, ticket } = req.params;

        if (!/^\d{6}$/.test(periodo)) {
            return res.status(400).json({
                success: false,
                mensaje: "El período debe tener formato YYYYMM."
            });
        }

        const token = await obtenerTokenSunat();

        const url =
            "https://api-sire.sunat.gob.pe/v1/contribuyente/migeigv/" +
            "libros/rvierce/gestionprocesosmasivos/web/masivo/" +
            "consultaestadotickets";

        const respuesta = await axios.get(url, {
            params: {
                perIni: periodo,
                perFin: periodo,
                page: 1,
                perPage: 20,
                numTicket: ticket
            },
            headers: {
                "Accept": "application/json",
                "Authorization": `Bearer ${token.access_token}`
            },
            timeout: 20000
        });

        res.json({
            success: true,
            periodo,
            ticket,
            estado: respuesta.data
        });

    } catch (error) {
        console.error(
            "Error consultando ticket:",
            error.response?.status || error.message
        );

        console.error(
            "RESPUESTA SIRE:",
            JSON.stringify(error.response?.data, null, 2)
        );

        res.status(error.response?.status || 500).json({
            success: false,
            mensaje: "SUNAT rechazó la consulta del ticket.",
            detalle: error.response?.data || error.message
        });
    }
});

router.get("/sire/descargar-rce/:periodo/:ticket", async (req, res) => {
    try {
        const { periodo, ticket } = req.params;

        if (!/^\d{6}$/.test(periodo)) {
            return res.status(400).json({
                success: false,
                mensaje: "El período debe tener formato YYYYMM."
            });
        }

        const token = await obtenerTokenSunat();

        // Primero consultamos el ticket para obtener
        // el nombre exacto del archivo generado por SUNAT.
        const urlEstado =
            "https://api-sire.sunat.gob.pe/v1/contribuyente/migeigv/" +
            "libros/rvierce/gestionprocesosmasivos/web/masivo/" +
            "consultaestadotickets";

        const estado = await axios.get(urlEstado, {
            params: {
                perIni: periodo,
                perFin: periodo,
                page: 1,
                perPage: 20,
                numTicket: ticket
            },
            headers: {
                "Accept": "application/json",
                "Authorization": `Bearer ${token.access_token}`
            },
            timeout: 20000
        });

        const registro = estado.data?.registros?.[0];

        if (!registro) {
            return res.status(404).json({
                success: false,
                mensaje: "SUNAT no encontró el ticket."
            });
        }

        if (registro.codEstadoProceso !== "06") {
            return res.status(409).json({
                success: false,
                mensaje: "El archivo todavía no está terminado.",
                estado: registro.desEstadoProceso
            });
        }

        const archivo = registro.archivoReporte?.[0];

        if (!archivo?.nomArchivoReporte) {
            return res.status(404).json({
                success: false,
                mensaje: "SUNAT no devolvió el nombre del archivo."
            });
        }

        const urlDescarga =
            "https://api-sire.sunat.gob.pe/v1/contribuyente/migeigv/" +
            "libros/rvierce/gestionprocesosmasivos/web/masivo/archivoreporte";

        const respuesta = await axios.get(urlDescarga, {
            params: {
                nomArchivoReporte: archivo.nomArchivoReporte,
                codTipoArchivoReporte: archivo.codTipoAchivoReporte,
                perTributario: registro.perTributario,
                codProceso: registro.codProceso,
                numTicket: registro.numTicket,
                codLibro: "080000"
            },
            headers: {
                "Accept": "application/octet-stream",
                "Authorization": `Bearer ${token.access_token}`
            },
            responseType: "arraybuffer",
            timeout: 60000
        });

        res.setHeader(
            "Content-Type",
            "application/zip"
        );

        res.setHeader(
            "Content-Disposition",
            `attachment; filename="${archivo.nomArchivoReporte}"`
        );

        res.send(Buffer.from(respuesta.data));

    } catch (error) {
        console.error(
            "Error descargando RCE:",
            error.response?.status || error.message
        );

        console.error(
            "RESPUESTA SIRE:",
            JSON.stringify(error.response?.data, null, 2)
        );

        res.status(error.response?.status || 500).json({
            success: false,
            mensaje: "No se pudo descargar el archivo RCE.",
            detalle: error.response?.data || error.message
        });
    }
});

router.get("/sire/rce-leer/:periodo", async (req, res) => {
    try {
        const { periodo } = req.params;

        if (!/^\d{6}$/.test(periodo)) {
            return res.status(400).json({
                success: false,
                mensaje: "El período debe tener formato YYYYMM."
            });
        }

        const fs = require("fs");
        const path = require("path");

        const carpeta = path.join(__dirname, "..", `rce-${periodo}`);

        if (!fs.existsSync(carpeta)) {
            return res.status(404).json({
                success: false,
                mensaje: `No existe la carpeta rce-${periodo}.`
            });
        }

        const archivos = fs.readdirSync(carpeta)
            .filter(nombre => nombre.endsWith(".txt"));

        if (archivos.length === 0) {
            return res.status(404).json({
                success: false,
                mensaje: "No se encontró el archivo TXT del RCE."
            });
        }

        const archivo = archivos[0];
        const rutaArchivo = path.join(carpeta, archivo);

        const contenido = fs.readFileSync(rutaArchivo, "utf8");

        const lineas = contenido
            .split(/\r?\n/)
            .filter(linea => linea.trim() !== "");

        if (lineas.length < 2) {
            return res.json({
                success: true,
                periodo,
                total: 0,
                registros: []
            });
        }

        const encabezados = lineas[0].split("|");

        const registros = lineas.slice(1).map(linea => {
            const valores = linea.split("|");
            const registro = {};

            encabezados.forEach((encabezado, indice) => {
                registro[encabezado.trim()] =
                    valores[indice]?.trim() || "";
            });

            return registro;
        });

        res.json({
            success: true,
            periodo,
            archivo,
            total: registros.length,
            registros
        });

    } catch (error) {
        console.error("Error leyendo RCE:", error);

        res.status(500).json({
            success: false,
            mensaje: "No se pudo leer el archivo RCE.",
            detalle: error.message
        });
    }
});

// ==========================================
// LECTOR DE XML DE COMPROBANTES
// ==========================================

const fs = require("fs");
const path = require("path");
const { extraerComprobante } = require("../services/xmlExtractor");

router.get("/sire/leer-xml/:archivo", async (req, res) => {
    try {
        const { archivo } = req.params;

        const rutaArchivo = path.join(
            __dirname,
            "..",
            archivo
        );

        if (!fs.existsSync(rutaArchivo)) {
            return res.status(404).json({
                success: false,
                mensaje: "No se encontró el archivo XML."
            });
        }

        const xml = fs.readFileSync(rutaArchivo, "utf8");

        const comprobante = extraerComprobante(xml);

        res.json({
            success: true,
            comprobante
        });

    } catch (error) {

        console.error(
            "Error leyendo XML:",
            error.message
        );

        res.status(500).json({
            success: false,
            mensaje: "No se pudo procesar el XML.",
            detalle: error.message
        });
    }
});

module.exports = router;
