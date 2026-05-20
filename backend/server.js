const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const app = express();
const PORT = 3000;
app.use(cors());
app.use(express.json());

app.post('/compile', (req, res) => {
    const { code, language } = req.body;

    if (!code || !language) {
        return res.status(400).json({ error: 'Code and language are required' });
    }

    if (language === "cpp") {
        const fileName = `temp_${Date.now()}.cpp`;
        const filePath = path.join(__dirname, fileName);
        try {
            fs.writeFileSync(filePath, code);
        } catch (writeErr) {
            console.error("Eroare la scriere fisier:", writeErr);
            return res.status(500).json({ output: "Eroare server la scrierea fisierului." });
        }
        const dockerFilePath = filePath.replace(/\\/g, '/');//FIXUL PENTRU WINDOWS
        const dockerImage = "frolvlad/alpine-gxx";
        const dockerCommand = `docker run --rm -v "${dockerFilePath}:/test.cpp" ${dockerImage} sh -c "g++ -o /out /test.cpp && /out"`;
        console.log(`Execut comanda: ${dockerCommand}`);
        exec(dockerCommand, (error, stdout, stderr) => {
            // Curățenie
            try {
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                    console.log("Fișier temporar șters.");
                }
            } catch (cleanupErr) {
                console.error("Nu am putut șterge fișierul:", cleanupErr);
            }
            if (error) {
                console.error(`Eroare compilare/execuție: ${stderr}`);
                return res.json({ output: stderr || error.message });
            }
            //s-o putut si asta
            console.log(`Output: ${stdout}`);
            res.json({ output: stdout });
        });

    } else {
        res.json({ output: "Limbaj nesuportat momentan." });
    }
});

// Ascultăm pe 0.0.0.0 pentru a prinde și IPv4 și IPv6 (Rezolvă Connection Refused)
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT} and listening on 0.0.0.0`);
});