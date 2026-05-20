document.addEventListener('DOMContentLoaded', () => {
    
    // 1. Initializare CodeMirror
    const textArea = document.getElementById("editorSource");
    
    // Verificare de siguranță
    if (!textArea) {
        console.error("Nu am gasit textarea-ul!");
        return;
    }

    const editor = CodeMirror.fromTextArea(textArea, {
        lineNumbers: true,
        mode: "text/x-c++src",
        theme: "dracula",
        indentUnit: 4,
        tabSize: 4,
        indentWithTabs: true,
        lineWrapping: true
    });
    
    editor.setSize("100%", "96%");

    // 2. Logica Butonului RUN
    const runBtn = document.getElementById("runButton");
    const consoleDiv = document.getElementById("consoleOutput");

    if (runBtn) {
        runBtn.addEventListener("click", (e) => {
            e.preventDefault(); 
            if(consoleDiv) {
                consoleDiv.innerText = "Compilare în curs... ⏳";
                consoleDiv.style.color = "yellow";
            }
            const code = editor.getValue();
            fetch('http://127.0.0.1:3000/compile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ language: "cpp", code: code })
            })
            .then(res => {
                if (!res.ok) {
                    throw new Error(`Server Error: ${res.status}`);
                }
                return res.json();
            })
            .then(data => {
                // C. AFIȘAREA REZULTATULUI PE SITE
                if (consoleDiv) {
                    consoleDiv.innerText = "Compilarea s-a efectuat in limbajul C++ si outpul este urmatorul:\n> " + data.output; 
                    
                    if (data.output.includes("Eroare") || data.output.includes("error")) {
                        consoleDiv.style.color = "#ff5555"; 
                    } else {
                        consoleDiv.style.color = "#50fa7b"; 
                    }
                } else {
                    alert("Rezultat: " + data.output); 
                }
            })
            .catch(err => {
                console.error("Eroare Frontend:", err);
                if(consoleDiv) {
                    consoleDiv.innerText = "Eroare de conexiune! Verifică consola (F12).";
                    consoleDiv.style.color = "red";
                }
            });
        });
    }
});