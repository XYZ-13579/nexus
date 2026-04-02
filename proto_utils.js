// --- Utility Functions ---

function getPosX(i) { 
    return (i - cols / 2 + 0.5) * w; 
}

function getPosZ(j) { 
    return (j - rows / 2 + 0.5) * w; 
}

function index(i, j) {
    if (i < 0 || j < 0 || i >= cols || j >= rows) return -1;
    return i + j * cols;
}

function drawLine(x1, y1, x2, y2) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
}
