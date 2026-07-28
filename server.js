require("dotenv").config();

const express = require("express");
const app = express();

const path = require("path");
const multer = require("multer");
const mysql = require("mysql2");
const cors = require("cors");
const nodemailer = require("nodemailer");
const SibApiV3Sdk = require("sib-api-v3-sdk");

const fs = require("fs");

const BASE_URL =
process.env.BASE_URL ||
"http://localhost:3000";




// 🔥 Google Drive (solo lo necesario)
const { subirArchivoDrive, hacerPublico, oAuth2Client } = require("./drive");
const { google } = require("googleapis");

nodemailer.createTransport


const dns = require("dns");

dns.setDefaultResultOrder("ipv4first");

// ======================================
// 📧 CONFIGURACIÓN DE CORREO
// ======================================


let transporter = null;


// ======================================
// 📧 CONFIGURAR GMAIL SOLO EN LOCAL
// ======================================

if (!process.env.BREVO_API_KEY) {

  transporter = nodemailer.createTransport({

    host: "smtp.gmail.com",
    port: 587,
    secure: false,

    auth: {
      user: process.env.GOOGLE_EMAIL,
      pass: process.env.GOOGLE_APP_PASSWORD
    },

    tls: {
      family: 4
    }

  });


  // Verificar Gmail solamente en local
  transporter.verify((error)=>{

    if(error){

      console.log("❌ Error Gmail:", error);

    }else{

      console.log("✅ Gmail listo para enviar correos");

    }

  });

}


// ======================================
// FUNCIÓN GENERAL DE ENVÍO
// LOCAL = GMAIL
// RENDER = BREVO
// ======================================

console.log("BREVO_API_KEY:", process.env.BREVO_API_KEY);
console.log("GOOGLE_EMAIL:", process.env.GOOGLE_EMAIL);


async function enviarCorreo(destinatario, asunto, mensaje) {

    // LOCAL -> Gmail
    if (!process.env.BREVO_API_KEY) {

        console.log("📧 Enviando correo con Gmail...");

        return transporter.sendMail({
            from: `"Sistema Web Planeación Académica" <${process.env.GOOGLE_EMAIL}>`,
            to: destinatario,
            subject: asunto,
            html: mensaje
        });

    }

    // RENDER -> Brevo
    console.log("☁️ Enviando correo con Brevo");
    console.log("EMAIL_FROM:", process.env.EMAIL_FROM);

    SibApiV3Sdk.ApiClient.instance.authentications["api-key"].apiKey =
        process.env.BREVO_API_KEY;

    const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

    const email = new SibApiV3Sdk.SendSmtpEmail();

    email.sender = {
        email: process.env.EMAIL_FROM,
        name: "Sistema Web Planeación Académica"
    };

    email.to = [
        {
            email: destinatario
        }
    ];

    email.replyTo = {
        email: process.env.EMAIL_FROM,
        name: "Sistema Web Planeación Académica"
    };

    email.subject = asunto;

    email.htmlContent = `
        <div style="font-family:Arial;padding:20px">
            ${mensaje}
            <hr>
            <p style="color:#666;font-size:12px">
                Sistema Web Planeación Académica
            </p>
        </div>
    `;

    return await apiInstance.sendTransacEmail(email);
}


// 🔥 CONEXIÓN BD
const db = mysql.createConnection({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "planeacion",
  ...(process.env.DB_HOST
    ? {
        ssl: {
          rejectUnauthorized: false,
        },
      }
    : {}),
});


db.connect(err => {
  if(err) throw err;
  console.log("✅ Conectado a MySQL");
});

// 🔹 Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const upload = multer({
  dest: "uploads/"
});

// ======================================
// GOOGLE DRIVE
// ======================================

const auth = new google.auth.GoogleAuth({
  keyFile: path.join(__dirname, "config/credenciales.json"),
  scopes: ["https://www.googleapis.com/auth/drive"],
});

const drive = google.drive({ version: "v3", auth });

module.exports = { subirArchivoDrive };

// ============================
// 🔥 LOGIN
// ============================
app.post("/login", (req, res) => {

  const { correo, password } = req.body;


console.log("BUSCANDO:", correo);
  
  db.query(
    "SELECT * FROM usuarios WHERE correo = ?",
    [correo],
    (err, result) => {

      if (err) return res.json({ status: "error" });

      if (result.length === 0) {
        return res.json({ status: "error", mensaje: "Usuario no existe" });
      }

      const user = result[0];

     if (user.password !== password) {
        return res.json({ status: "error", mensaje: "Contraseña incorrecta" });
      }

      res.json({
        status: "ok",
        id: user.id,
        nombre: user.nombre,
        tipo: user.tipo
      });

    }
  );

});



// ============================
// 🔥 UPLOAD
// ============================
app.post("/upload", upload.single("archivo"), async (req, res) => {
  try {
    const file = req.file;

    const resultado = await subirArchivoDrive(file.path, file.originalname);

    const link = await hacerPublico(resultado.id);

    fs.unlinkSync(file.path);

    res.json({
      mensaje: "Subido a Google Drive",
      link: link,
      id: resultado.id
    });

  } catch (error) {
    console.log(error);
    res.status(500).send("Error al subir a Drive");
  }
});
// ============================
// 🔥 REGISTRO (CORREGIDO)
// ============================
app.post('/registro', (req, res) => {

  const { nombre, correo, password, tipo } = req.body;

  // 🔴 1. VALIDAR CAMPOS VACÍOS
  if (!nombre || !correo || !password || !tipo) {
    return res.json({
      status: "error",
      mensaje: "Faltan datos"
    });
  }

  // 🔴 2. VERIFICAR SI YA EXISTE EL CORREO
  db.query(
    "SELECT * FROM usuarios WHERE correo = ?",
    [correo],
    (err, result) => {

      if (err) {
        console.log(err);
        return res.json({ status: "error", mensaje: "Error servidor" });
      }

      if (result.length > 0) {
        return res.json({
          status: "error",
          mensaje: "❌ Este correo ya está registrado"
        });
      }

      // 🔥 3. INSERTAR USUARIO NUEVO
      const sql = `
        INSERT INTO usuarios (nombre, correo, password, tipo)
        VALUES (?, ?, ?, ?)
      `;

      db.query(
        sql,
        [nombre, correo, password, tipo],
        (err2) => {

          if (err2) {
            console.log(err2);
            return res.json({
              status: "error",
              mensaje: "Error al registrar usuario"
            });
          }

          res.json({
            status: "ok",
            mensaje: "✅ Usuario registrado correctamente"
          });

        }
      );

    }
  );

});
// ============================
// 🔥 ARCHIVOS
// ============================
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, 'uploads'));
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});


// ============================
// 🔥 PLANEACIONES
// ============================
app.post("/guardar-planeacion", upload.single("archivo"), async (req, res) => {

  console.log("Datos recibidos:");
  console.log(req.body);

console.log("MATERIA:", req.body.materia);
console.log("GRUPO:", req.body.grupo);

  console.log("FILE:", req.file);

 const { 
    periodo, 
    carrera, 
    grupo,
    materia,
    fecha, 
    id_usuario 
} = req.body;

  let linkDrive = null;

  try {

    // ☁️ SUBIR A DRIVE
    if (req.file) {

      console.log("☁️ Subiendo archivo a Drive...");

      const resultado = await subirArchivoDrive(
        req.file.path,
        req.file.originalname
      );

      console.log("☁️ Resultado Drive:", resultado);

      console.log("🔓 Haciendo público...");

      linkDrive = await hacerPublico(resultado.id);

      console.log("🔗 Link generado:", linkDrive);

      // borrar archivo local
      fs.unlinkSync(req.file.path);
    }

    // 💾 GUARDAR EN BASE DE DATOS
    db.query(`
     INSERT INTO planeaciones
(
periodo,
carrera,
grupo,
materia,
fecha,
id_usuario,
archivo
)
VALUES (?,?,?,?,?,?,?)
    `, [
periodo,
carrera,
grupo,
materia,
fecha,
id_usuario,
linkDrive
], (err, result) => {

      if (err) {
        console.log("❌ ERROR MYSQL:", err);

        return res.status(500).json({
          status: "error",
          mensaje: "Error al guardar en base de datos",
          debug: err
        });
      }

      console.log("✅ Guardado en BD correctamente");

      // 🔔 NOTIFICACIÓN
db.query(
"SELECT id FROM usuarios WHERE tipo='administrador'",
(errAdmin, adminData)=>{

if(errAdmin || adminData.length===0){
console.log("No existe administrador");
return;
}

const idAdmin = adminData[0].id;


db.query(
"INSERT INTO notificaciones (id_usuario, destinatario, mensaje) VALUES (?, ?, ?)",
[
idAdmin,
"admin",
`📄 ${nombreDocente} envió una nueva planeación`
],
(err3)=>{

if(err3){
console.log("❌ Error notificación:",err3);
}else{
console.log("✅ Notificación guardada");
}

});


});
      // 🔥 RESPUESTA FINAL (IMPORTANTE)
      return res.status(200).json({
        status: "ok",
        mensaje: "Planeación guardada correctamente",
        link: linkDrive || null
      });

    });

  } catch (error) {
    console.log("❌ ERROR DRIVE:", error);

    return res.status(500).json({
      status: "error",
      mensaje: "Error en Drive",
      debug: error.message
    });
  }

});


// 🔥 TODAS (ADMIN)
app.get('/planeaciones', (req, res) => {
  db.query("SELECT * FROM planeaciones", (err, result) => {
    res.json(result);
  });
});

// 🔥 SOLO DOCENTE
app.get('/planeaciones-docente/:id', (req, res) => {
  const id = req.params.id;

    console.log("ID recibido:", id);

  db.query(
    "SELECT * FROM planeaciones WHERE id_usuario = ?",
    [id],
    (err, result) => {
      if(err) return res.json([]);

      console.log("Planeaciones encontradas:", result);

      res.json(result);
    }
  );
});

app.delete('/eliminar-planeacion/:id', (req, res) => {
  const id = req.params.id;

  db.query("DELETE FROM planeaciones WHERE id = ?", [id], (err, result) => {
    if(err) return res.send("error");
    if(result.affectedRows === 0) return res.send("no existe");
    res.send("ok");
  });
});

app.get('/planeacion/:id', (req, res) => {
  const id = req.params.id;

  db.query("SELECT * FROM planeaciones WHERE id=?", [id], (err, result) => {
    res.json(result[0]);
  });
});

// ============================
// ✏️ EDITAR PLANEACIÓN
// ============================
app.post('/editar-planeacion/:id', upload.single('archivo'), (req, res) => {

  const id = req.params.id;
  const { periodo, carrera, grupo, materia, fecha } = req.body;

  let sql = `
    UPDATE planeaciones
    SET periodo=?, carrera=?, grupo=?, materia=?, fecha=?
  `;

  let params = [periodo, carrera, grupo, materia, fecha];

  if(req.file){
    sql += ", archivo=?";
    params.push(req.file.filename);
  }

  sql += " WHERE id=?";
  params.push(id);

  db.query(sql, params, (err) => {

    if(err){
      console.log(err);
      return res.send("error");
    }

    res.send("ok");

  });

});



// ============================
// 🔥 HORARIOS
// ============================
app.post("/guardar-horario", (req, res) => {

const {
id_docente,
periodo,
dia,
hora,
materia,
grupo,
carrera
} = req.body;

if (!id_docente || !periodo || !dia || !hora || !materia || !grupo || !carrera) {

return res.json({
status: "error",
mensaje: "Faltan datos"
});

}

const sql = `
INSERT INTO horarios
(id_docente, periodo, dia, hora, materia, grupo, carrera)
VALUES (?, ?, ?, ?, ?, ?, ?)
`;

db.query(
sql,
[id_docente, periodo, dia, hora, materia, grupo, carrera],
(err) => {

if(err){
console.log(err);
return res.json({ status: "error" });
}

res.json({
status: "ok",
mensaje: "Horario guardado correctamente"
});

});

});

// 🔥 HORARIOS POR DOCENTE
app.get("/horarios/:id", (req, res) => {

  const id = req.params.id;

  db.query("SELECT * FROM horarios WHERE id_docente = ?", [id], (err, result) => {
    if(err) return res.json([]);
    res.json(result);
  });

});

// ============================
// ✏️ EDITAR HORARIO (AGREGADO)
// ============================
app.put('/horarios/:id', (req, res) => {

  const id = req.params.id;
  const { dia, hora, materia, grupo, carrera } = req.body;

  const sql = `
    UPDATE horarios 
    SET dia=?, hora=?, materia=?, grupo=?, carrera=?
    WHERE id=?
  `;

  db.query(sql, [dia, hora, materia, grupo, carrera, id], (err) => {

    if (err) {
      return res.json({ status: "error" });
    }

    res.json({
      status: "ok",
      mensaje: "Horario actualizado correctamente"
    });

  });

});

// ============================
// 🗑️ ELIMINAR HORARIO (AGREGADO)
// ============================
app.delete('/horarios/:id', (req, res) => {

  const id = req.params.id;

  db.query("DELETE FROM horarios WHERE id=?", [id], (err, result) => {

    if (err) return res.json({ status: "error" });

    res.json({
      status: "ok",
      mensaje: "Horario eliminado correctamente"
    });

  });

});

// ============================
// 🔥 NOTIFICACIONES
// ============================
app.post('/crear-notificacion', (req, res) => {

  const { id_usuario, mensaje } = req.body;

  db.query("INSERT INTO notificaciones (id_usuario, mensaje) VALUES (?, ?)", 
  [id_usuario, mensaje], () => {
    res.json({ status: "ok" });
  });

});

app.get('/notificaciones/:id', (req, res) => {

    console.log("ENTRE A LA RUTA DE NOTIFICACIONES ");

    const id = req.params.id;

    console.log("ID:", id);

   db.query(
    "SELECT * FROM notificaciones WHERE id_usuario = ? AND leida = 0 ORDER BY fecha DESC",
    [id],
    (err, result) => {

            console.log("ERROR:", err);
            console.log("RESULTADO:", result);

            res.json(result);

        }
    );

});

// ============================
// 🔥 DOCENTES
// ============================
app.get('/docentes', (req, res) => {
  db.query(`
    SELECT u.nombre, 
    COALESCE(MAX(h.carrera), 'Sin asignar') as carrera
    FROM usuarios u
    LEFT JOIN horarios h ON u.id = h.id_docente
    WHERE u.tipo='docente'
    GROUP BY u.id
  `, (err, result) => {
    if(err) return res.json([]);
    res.json(result);
  });
});

// ============================
// 🔥 RUTA PRINCIPAL
// ============================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

// 🔥 TODOS LOS HORARIOS (ADMIN)
app.get("/horarios", (req, res) => {

  db.query(`
    SELECT h.*, u.nombre 
    FROM horarios h
    JOIN usuarios u ON h.id_docente = u.id
  `, (err, result) => {

    if(err) return res.json([]);
    res.json(result);

  });

});

// ============================
// 🔥 GRUPOS GUARDADO AUTOMATICO
// ============================
app.get('/grupos', (req, res) => {

db.query(`
SELECT DISTINCT
p.grupo,
p.materia,
p.carrera,
u.nombre as docente

FROM planeaciones p

JOIN usuarios u
ON p.id_usuario = u.id
`,
(err, result) => {

if(err) return res.json([]);

res.json(result);

});

});

// 🔥 APROBAR / RECHAZAR PLANEACION
app.put("/estado-planeacion/:id", (req, res) => {

    const id = req.params.id;
    const { estado, observaciones } = req.body;

    db.query(
        `
        UPDATE planeaciones
        SET estado = ?, observaciones = ?
        WHERE id = ?
        `,
        [estado, observaciones || "", id],
        (err) => {

            if (err) {
                console.log(err);
                return res.json({
                    mensaje: "Error"
                });
            }

            // 🔥 Buscar el docente dueño de la planeación
            db.query(
                "SELECT id_usuario FROM planeaciones WHERE id=?",
                [id],
                (err2, result) => {

                    if (err2 || result.length === 0) {
                        console.log(err2);
                        return res.json({
                            mensaje: "Estado actualizado"
                        });
                    }

                    const idDocente = result[0].id_usuario;

                    // 🔔 Crear notificación para el docente
                    db.query(
                        `INSERT INTO notificaciones
                        (id_usuario, destinatario, mensaje)
                        VALUES (?, 'docente', ?)`,
                        [
                            idDocente,
                            `📄 Tu planeación fue ${estado}.`
                        ],
                        (err3) => {

                            if (err3) {
                                console.log("Error creando notificación:", err3);
                            }

                            res.json({
                                mensaje: "Estado actualizado correctamente"
                            });

                        }
                    );

                }
            );

        }
    );

});

// ============================
// 🔔 MARCAR COMO LEÍDAS
// ============================
app.post('/leer-notificaciones', (req, res) => {

  const { id_usuario } = req.body;

  db.query(
    "UPDATE notificaciones SET leida=1 WHERE id_usuario=?",
    [id_usuario],
    (err, result) => {

      if(err){
        console.log(err);
        return res.status(500).json({
          error:"Error al actualizar notificaciones"
        });
      }

      res.json({ status:"ok" });

    }
  );

});


// ============================
// ENVIAR CÓDIGO DE RECUPERACIÓN
// ============================

app.post("/enviar-codigo", async (req,res)=>{


const {correo}=req.body;


console.log(
"📩 SOLICITUD DE RECUPERACIÓN PARA:",
correo
);



const codigo =
Math.floor(100000 + Math.random()*900000);



db.query(

"UPDATE usuarios SET codigo_recuperacion=? WHERE correo=?",

[codigo,correo],


async(err,result)=>{


if(err){

console.log("❌ ERROR MYSQL:",err);

return res.json({

mensaje:"Error servidor"

});

}



if(result.affectedRows===0){

return res.json({

mensaje:"Este correo no está registrado en el sistema"

});

}



try{


console.log(
"📨 ENVIANDO CÓDIGO A:",
correo
);



await enviarCorreo(

correo,

"Código de recuperación",

`

<h2>Recuperación de contraseña</h2>

<p>Tu código es:</p>

<h1>${codigo}</h1>

`

);



console.log("✅ CORREO ENVIADO");



return res.json({

mensaje:"Código enviado correctamente"

});



}catch(error){


console.log(
"❌ ERROR ENVÍO:",
error
);



return res.json({

mensaje:"Error al enviar correo"

});


}



}


);



});
// VERIFICAR CÓDIGO
app.post("/verificar-codigo", (req, res) => {

  const {
    correo,
    codigo,
    nueva
  } = req.body;

  db.query(

    "SELECT codigo_recuperacion FROM usuarios WHERE correo=?",

    [correo],

    (err, result) => {

      if(err){
        return res.json({
          mensaje:"Error servidor"
        });
      }

      if(result.length === 0){
        return res.json({
          mensaje:"Correo no encontrado"
        });
      }

      if(
        result[0].codigo_recuperacion != codigo
      ){
        return res.json({
          mensaje:"Código incorrecto"
        });
      }

      db.query(

        "UPDATE usuarios SET password=?, codigo_recuperacion=NULL WHERE correo=?",

        [nueva, correo],

        (err2) => {

          if(err2){
            return res.json({
              mensaje:"Error servidor"
            });
          }

          res.json({
            status:"ok",
            mensaje:"Contraseña actualizada correctamente"
          });

        }

      );

    }

  );

});



// ============================
// 🔐 GOOGLE OAUTH CALLBACK
// ============================

app.get("/oauth2callback", async (req, res) => {

  const code = req.query.code;

  if(!code){
    return res.send("No llegó código de Google");
  }

  try {

    const { tokens } = await oAuth2Client.getToken(code);

    console.log("TOKEN NUEVO:");
    console.log(tokens.refresh_token);

    res.send("Autorización correcta. Revisa la terminal.");

  } catch(error){

    console.log("ERROR TOKEN:", error);

    res.send("Error generando token");

  }

});

// ============================
// 🚀 SERVIDOR
// ============================
// Debe quedar algo así:
const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
