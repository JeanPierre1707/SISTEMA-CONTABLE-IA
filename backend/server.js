const express = require("express");
const path = require("path");
const fs = require("fs");
const padronSscoRouter = require("./routes/padronSsco");
const sireRouter = require("./routes/sire");

const app = express();
const PORT = 3000;
const users = JSON.parse(
    fs.readFileSync(path.join(__dirname, "users.json"), "utf8")
);
app.use(express.json());

app.post("/api/login", (req, res) => {
    const { usuario, password } = req.body;

    const user = users.find(
        u => u.usuario === usuario && u.password === password
    );

    if (user) {
        return res.json({
            success: true,
            mensaje: "Acceso autorizado"
        });
    }

    res.status(401).json({
        success: false,
        mensaje: "Usuario o contraseña incorrectos"
    });
});

app.use("/api", padronSscoRouter);
app.use("/api", sireRouter);

// Servir los archivos del frontend
app.use(express.static(path.join(__dirname, "..", "frontend")));

// Página de inicio
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "..", "frontend", "login", "index.html"));
});
app.get("/login", (req, res) => { 
    res.sendFile(path.join(__dirname, "..", "frontend", "login", "index.html")); 
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`Servidor ejecutándose en http://localhost:${PORT}`);
});
