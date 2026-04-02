// --- Physics & Navigation ---

function findPath(start, end, isEnemy = false) {
    const queue = [];
    const visited = new Set();
    const cameFrom = new Map();

    const key = (i, j) => `${i},${j}`;
    const startCell = grid[index(start.i, start.j)];
    const endCell = grid[index(end.i, end.j)];

    if (!startCell || !endCell) return [];
    if (startCell.i === endCell.i && startCell.j === endCell.j) return [];

    const isPassable = (type) => {
        if (type === 0) return true;
        if (type === 2) return isEnemy ? envParams.enemyCanPassDoors : true;
        return false;
    };
    const isConnected = (a, b) => {
        if (!a || !b) return false;
        const di = b.i - a.i;
        const dj = b.j - a.j;
        if (di === 1 && isPassable(a.walls[1])) return true;
        if (di === -1 && isPassable(a.walls[3])) return true;
        if (dj === 1 && isPassable(a.walls[2])) return true;
        if (dj === -1 && isPassable(a.walls[0])) return true;
        return false;
    };

    queue.push(startCell);
    visited.add(key(start.i, start.j));

    while (queue.length > 0) {
        const curr = queue.shift();
        if (curr.i === end.i && curr.j === end.j) break;

        const dirs = [{ di: 0, dj: -1 }, { di: 1, dj: 0 }, { di: 0, dj: 1 }, { di: -1, dj: 0 }];
        for (const { di, dj } of dirs) {
            const ni = curr.i + di, nj = curr.j + dj;
            const neighbor = grid[index(ni, nj)];
            if (neighbor && isConnected(curr, neighbor)) {
                const k = key(ni, nj);
                if (!visited.has(k)) {
                    visited.add(k);
                    cameFrom.set(k, curr);
                    queue.push(neighbor);
                }
            }
        }
    }

    const path = [];
    let curr = endCell;
    while (!(curr.i === start.i && curr.j === start.j)) {
        path.unshift(curr);
        const prev = cameFrom.get(key(curr.i, curr.j));
        if (!prev) break;
        curr = prev;
    }
    return path;
}

function rectIntersect(ax1, ay1, ax2, ay2, bx1, by1, bx2, by2) {
    return ax1 < bx2 && ax2 > bx1 && ay1 < by2 && ay2 > by1;
}

function isColliding(x, z, r, isEnemy = false) {
    const ix = Math.floor((x + cols * w / 2) / w);
    const jz = Math.floor((z + rows * w / 2) / w);
    
    // Dynamic search range based on radius
    const range = Math.ceil(r / w) + 1;

    for (let di = -range; di <= range; di++) {
        for (let dj = -range; dj <= range; dj++) {
            const i = ix + di, j = jz + dj;
            if (i < 0 || i >= cols || j < 0 || j >= rows) continue;
            const cell = grid[index(i, j)];
            if (!cell) continue;

            const cx = getPosX(i);
            const cz = getPosZ(j);
            const wt = 2; // wall thickness
            const hwt = wt / 2;
            const hw = w / 2;

            const isSolid = (type) => {
                if (type === 0) return false;
                if (type === 2) return isEnemy ? !envParams.enemyCanPassDoors : false;
                return true;
            };

            if (isSolid(cell.walls[0]) && rectIntersect(x - r, z - r, x + r, z + r, cx - hw - hwt, cz - hw - hwt, cx + hw + hwt, cz - hw + hwt)) return true;
            if (isSolid(cell.walls[1]) && rectIntersect(x - r, z - r, x + r, z + r, cx + hw - hwt, cz - hw - hwt, cx + hw + hwt, cz + hw + hwt)) return true;
            if (isSolid(cell.walls[2]) && rectIntersect(x - r, z - r, x + r, z + r, cx - hw - hwt, cz + hw - hwt, cx + hw + hwt, cz + hw + hwt)) return true;
            if (isSolid(cell.walls[3]) && rectIntersect(x - r, z - r, x + r, z + r, cx - hw - hwt, cz - hw - hwt, cx - hw + hwt, cz + hw + hwt)) return true;
        }
    }
    return false;
}
