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
                codProceso: "69",
                codOrigen: "1",
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

// ==========================================
// SINCRONIZAR RCE COMPLETO
// ==========================================

router.post("/sire/sincronizar-rce", async (req, res) => {
    try {
        const { periodo } = req.body;
        const periodoApi = String(periodo || "").replace("-", "");

        if (!/^\d{6}$/.test(periodoApi)) {
            return res.status(400).json({
                success: false,
                mensaje: "El período enviado no es válido."
            });
        }

        console.log("==========================================");
        console.log("INICIANDO SINCRONIZACIÓN RCE:", periodoApi);
        console.log("==========================================");

        // 1. OBTENER TOKEN
        const token = await obtenerTokenSunat();

        console.log("✓ Token SUNAT obtenido");

        // 2. SOLICITAR GENERACIÓN DEL ARCHIVO
        const urlSolicitud =
            `https://api-sire.sunat.gob.pe/v1/contribuyente/migeigv/` +
            `libros/rce/ajustesposteriores/web/ajustesposteriores/` +
            `${periodoApi}/solicitardescarga`;

        const solicitud = await axios.get(urlSolicitud, {
            params: {
                codTipoArchivo: 0,
                codMoneda: "PEN",
                codProceso: "69",
                codOrigen: "1",
                lisPeriodos: periodoApi
            },
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Authorization": `Bearer ${token.access_token}`
            },
            timeout: 20000
        });

        console.log(
            "RESPUESTA SOLICITUD RCE:",
            JSON.stringify(solicitud.data, null, 2)
        );

        const ticket =
            solicitud.data?.numTicket ||
            solicitud.data?.ticket ||
            solicitud.data?.numeroTicket;

        if (!ticket) {
            return res.status(502).json({
                success: false,
                mensaje: "SUNAT no devolvió un ticket.",
                detalle: solicitud.data
            });
        }

        console.log("✓ TICKET RCE:", ticket);

        // 3. CONSULTAR EL TICKET HASTA QUE TERMINE
        const urlEstado =
            "https://api-sire.sunat.gob.pe/v1/contribuyente/migeigv/" +
            "libros/rvierce/gestionprocesosmasivos/web/masivo/" +
            "consultaestadotickets";

        let estadoFinal = null;
        let registroFinal = null;

        for (let intento = 1; intento <= 12; intento++) {

            console.log(
                `⏳ CONSULTANDO TICKET ${ticket} — intento ${intento}/12`
            );

            const estado = await axios.get(urlEstado, {
                params: {
                    perIni: periodoApi,
                    perFin: periodoApi,
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

            registroFinal = estado.data?.registros?.[0];

            if (!registroFinal) {
                throw new Error(
                    "SUNAT no devolvió información del ticket."
                );
            }

            estadoFinal = registroFinal.desEstadoProceso;

            console.log(
                "ESTADO TICKET:",
                registroFinal.codEstadoProceso,
                estadoFinal
            );

            if (registroFinal.codEstadoProceso === "06") {
                break;
            }

            await new Promise(resolve =>
                setTimeout(resolve, 5000)
            );
        }

        // 4. VERIFICAR QUE TERMINÓ
        if (
            !registroFinal ||
            registroFinal.codEstadoProceso !== "06"
        ) {
            return res.status(408).json({
                success: false,
                mensaje:
                    "SUNAT todavía no terminó de generar el archivo RCE.",
                ticket,
                estado: estadoFinal
            });
        }

        console.log("✓ PROCESO RCE TERMINADO");

        // 5. OBTENER ARCHIVO GENERADO
        const archivo =
            registroFinal.archivoReporte?.[0];

        if (!archivo?.nomArchivoReporte) {
            return res.status(404).json({
                success: false,
                mensaje:
                    "SUNAT terminó el proceso pero no devolvió el archivo.",
                ticket,
                estado: registroFinal
            });
        }

        const nombreArchivo =
            archivo.nomArchivoReporte;

        const tipoArchivo =
            archivo.codTipoAchivoReporte;

        console.log(
            "✓ ARCHIVO RCE:",
            nombreArchivo
        );

        // 6. DESCARGAR ZIP DESDE SUNAT
        const urlDescarga =
            "https://api-sire.sunat.gob.pe/v1/contribuyente/migeigv/" +
            "libros/rvierce/gestionprocesosmasivos/web/masivo/" +
            "archivoreporte";

        const respuestaArchivo = await axios.get(
            urlDescarga,
            {
                params: {
                    nomArchivoReporte:
                        nombreArchivo,

                    codTipoArchivoReporte:
                        tipoArchivo,

                    perTributario:
                        registroFinal.perTributario,

                    codProceso:
                        registroFinal.codProceso,

                    numTicket:
                        registroFinal.numTicket,

                    codLibro: "080000"
                },

                headers: {
                    "Accept":
                        "application/octet-stream",

                    "Authorization":
                        `Bearer ${token.access_token}`
                },

                responseType: "arraybuffer",

                timeout: 60000
            }
        );

        // 7. GUARDAR EL ZIP EN NEXORA
        const fs = require("fs");
        const path = require("path");

        const carpetaRce = path.join(
            __dirname,
            "..",
            `rce-${periodoApi}`
        );

        if (!fs.existsSync(carpetaRce)) {
            fs.mkdirSync(
                carpetaRce,
                { recursive: true }
            );
        }

        const rutaZip = path.join(
            carpetaRce,
            nombreArchivo
        );

        fs.writeFileSync(
            rutaZip,
            Buffer.from(respuestaArchivo.data)
        );

        console.log(
            "✓ ZIP RCE GUARDADO:",
            rutaZip
        );

        registrarSincronizacionRce({
            periodo: periodoApi,
            ticket: ticket,
            archivo: nombreArchivo,
            estado: registroFinal.desEstadoProceso
        });

        // 8. RESPUESTA FINAL A NEXORA
        res.json({
            success: true,
            mensaje:
                "RCE sincronizado correctamente.",
            periodo: periodoApi,
            ticket,
            estado:
                registroFinal.desEstadoProceso,
            archivo:
                nombreArchivo,
            ruta:
                `rce-${periodoApi}/${nombreArchivo}`
        });

    } catch (error) {

        console.error(
            "=========================================="
        );

        console.error(
            "ERROR SINCRONIZANDO RCE:",
            error.response?.status ||
            error.message
        );

        console.error(
            "RESPUESTA SIRE:",
            JSON.stringify(
                error.response?.data,
                null,
                2
            )
        );

        console.error(
            "=========================================="
        );

        res.status(
            error.response?.status || 500
        ).json({
            success: false,
            mensaje:
                "No se pudo sincronizar el RCE.",
            detalle:
                error.response?.data ||
                error.message
        });
    }
});

// ==========================================
// HISTORIAL DE SINCRONIZACIONES RCE
// ==========================================

const archivoHistorialRce = path.join(
    __dirname,
    "../historial-rce.json"
);

let historialRce = {};

if (fs.existsSync(archivoHistorialRce)) {
    try {
        historialRce = JSON.parse(
            fs.readFileSync(archivoHistorialRce, "utf8")
        );
    } catch (error) {
        console.error(
            "No se pudo leer historial-rce.json:",
            error.message
        );

        historialRce = {};
    }
}

router.get("/sire/historial-rce/:periodo", (req, res) => {
    try {
        const { periodo } = req.params;

        if (!/^\d{6}$/.test(periodo)) {
            return res.status(400).json({
                success: false,
                mensaje: "El período debe tener formato YYYYMM."
            });
        }

        const registro = historialRce[periodo];

        res.json({
            success: true,
            periodo,
            sincronizado: Boolean(registro),
            datos: registro || null
        });

    } catch (error) {
        console.error("Error consultando historial RCE:", error);

        res.status(500).json({
            success: false,
            mensaje: "No se pudo consultar el historial RCE."
        });
    }
});

// ==========================================
// REGISTRAR SINCRONIZACIÓN RCE
// ==========================================

function registrarSincronizacionRce({
    periodo,
    ticket,
    archivo,
    estado
}) {
    historialRce[periodo] = {
        periodo,
        ticket,
        archivo,
        estado,
        fechaHora: new Date().toISOString()
    };

    fs.writeFileSync(
        archivoHistorialRce,
        JSON.stringify(historialRce, null, 2),
        "utf8"
    );

    console.log(
        "✓ HISTORIAL RCE GUARDADO:",
        historialRce[periodo]
    );
}
module.exports = router;
