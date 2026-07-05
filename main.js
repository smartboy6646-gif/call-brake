// --- CONSTANTS & CONFIG ---
const COLORS = [
    0xFF3366, // Red/Pink
    0x33CCFF, // Blue
    0x66FF66, // Green
    0xFFCC00, // Yellow
    0x9933FF, // Purple
    0xFF9933, // Orange
    0x00FFFF, // Cyan
    0xFF00FF, // Magenta
    0xFFFFFF  // White
];

const CONFIG = {
    type: Phaser.AUTO,
    scale: {
        mode: Phaser.Scale.FIT,
        parent: 'game-container',
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: 720,
        height: 1280
    },
    backgroundColor: '#1a1a2e',
    scene: []
};

// --- SCENES ---

class BootScene extends Phaser.Scene {
    constructor() { super('BootScene'); }
    preload() {
        // Generate soft gradient background texture
        const canvas = document.createElement('canvas');
        canvas.width = 720; canvas.height = 1280;
        const ctx = canvas.getContext('2d');
        const grd = ctx.createLinearGradient(0, 0, 0, 1280);
        grd.addColorStop(0, "#0f0c29");
        grd.addColorStop(0.5, "#302b63");
        grd.addColorStop(1, "#24243e");
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, 720, 1280);
        this.textures.addCanvas('bg', canvas);
    }
    create() {
        this.scene.start('MenuScene');
    }
}

class MenuScene extends Phaser.Scene {
    constructor() { super('MenuScene'); }
    create() {
        this.add.image(360, 640, 'bg');
        
        this.add.text(360, 250, 'COLOR MATCH', { fontSize: '80px', fontStyle: 'bold', fill: '#ffffff' }).setOrigin(0.5);
        
        const bestTime = localStorage.getItem('cm_best_time') || '--:--';
        const bestMoves = localStorage.getItem('cm_best_moves') || '--';
        this.add.text(360, 350, `Best Time: ${bestTime}\nBest Moves: ${bestMoves}`, { fontSize: '32px', fill: '#aaaaaa', align: 'center' }).setOrigin(0.5);

        this.createButton(360, 600, 'EASY (6 Rods)', () => this.startGame({ rods: 6, colors: 5, capacity: 4 }));
        this.createButton(360, 750, 'MEDIUM (8 Rods)', () => this.startGame({ rods: 8, colors: 7, capacity: 5 }));
        this.createButton(360, 900, 'HARD (10 Rods)', () => this.startGame({ rods: 10, colors: 9, capacity: 6 }));
    }

    createButton(x, y, text, callback) {
        const btn = this.add.container(x, y);
        const bg = this.add.graphics();
        bg.fillStyle(0x4a4e69, 1).fillRoundedRect(-200, -50, 400, 100, 25);
        const txt = this.add.text(0, 0, text, { fontSize: '40px', fill: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
        btn.add([bg, txt]);
        
        const hitArea = new Phaser.Geom.Rectangle(-200, -50, 400, 100);
        btn.setInteractive(hitArea, Phaser.Geom.Rectangle.Contains);
        btn.on('pointerdown', callback);
        btn.on('pointerover', () => bg.fillStyle(0x9a8c98, 1).fillRoundedRect(-200, -50, 400, 100, 25));
        btn.on('pointerout', () => bg.fillStyle(0x4a4e69, 1).fillRoundedRect(-200, -50, 400, 100, 25));
    }

    startGame(diff) {
        this.scene.start('GameScene', diff);
        this.scene.start('UIScene');
    }
}

class GameScene extends Phaser.Scene {
    constructor() { super('GameScene'); }
    
    init(data) {
        this.diff = data;
        this.state = {
            rods: [], 
            history: [], 
            moves: 0,
            startTime: Date.now(),
            active: false
        };
        this.visualRings = []; // 2D array mapping to rods
        this.selectedRod = null;
        this.isAnimating = false;
    }

    create() {
        this.add.image(360, 640, 'bg');
        
        // Countdown
        const countdownText = this.add.text(360, 640, '3', { fontSize: '150px', fontStyle: 'bold', fill: '#ffffff' }).setOrigin(0.5);
        this.tweens.add({
            targets: countdownText, scale: 0.5, alpha: 0, duration: 800,
            onComplete: () => {
                countdownText.setText('2').setScale(1).setAlpha(1);
                this.tweens.add({
                    targets: countdownText, scale: 0.5, alpha: 0, duration: 800,
                    onComplete: () => {
                        countdownText.setText('1').setScale(1).setAlpha(1);
                        this.tweens.add({
                            targets: countdownText, scale: 0.5, alpha: 0, duration: 800,
                            onComplete: () => {
                                countdownText.setText('GO!').setScale(1.5).setAlpha(1);
                                this.tweens.add({
                                    targets: countdownText, alpha: 0, duration: 500,
                                    onComplete: () => {
                                        this.state.active = true;
                                        this.state.startTime = Date.now();
                                        countdownText.destroy();
                                    }
                                });
                            }
                        });
                    }
                });
            }
        });

        this.generatePuzzle();
        this.drawBoard();
    }

    generatePuzzle() {
        // 1. Create solved state
        let tempRods = Array.from({length: this.diff.rods}, () => []);
        for (let i = 0; i < this.diff.colors; i++) {
            for(let c = 0; c < this.diff.capacity; c++) {
                tempRods[i].push(COLORS[i]);
            }
        }
        
        // 2. Reverse Shuffle (guarantees solvability)
        let shuffles = this.diff.colors * 20;
        while(shuffles > 0) {
            let targetRodIndex = Phaser.Math.Between(0, this.diff.rods - 1);
            let sourceRodIndex = Phaser.Math.Between(0, this.diff.rods - 1);
            
            if (targetRodIndex === sourceRodIndex) continue;
            
            let sourceRod = tempRods[sourceRodIndex];
            let targetRod = tempRods[targetRodIndex];
            
            if (targetRod.length > 0 && sourceRod.length < this.diff.capacity) {
                let colorToMove = targetRod[targetRod.length - 1];
                // In reverse shuffle, we can move a ring anywhere as long as there is space
                sourceRod.push(targetRod.pop());
                shuffles--;
            }
        }
        this.state.rods = tempRods;
    }

    drawBoard() {
        this.visualRings = Array.from({length: this.diff.rods}, () => []);
        const startX = 360 - ((this.diff.rods / 2) * 110) + 55;
        const baseY = 950;
        
        for (let i = 0; i < this.diff.rods; i++) {
            const x = (this.diff.rods > 6) ? 
                (i % 5) * 135 + 90 : 
                startX + (i * 110);
                
            const y = (this.diff.rods > 6 && i >= 5) ? baseY + 200 : baseY;
            const adjustedY = (this.diff.rods > 6) ? y - 350 : baseY;

            // Draw Rod Base & Pole
            this.add.graphics()
                .fillStyle(0x3a3a50, 1)
                .fillRoundedRect(x - 40, adjustedY, 80, 20, 10) // Base
                .fillRoundedRect(x - 10, adjustedY - (this.diff.capacity * 45) - 30, 20, (this.diff.capacity * 45) + 30, 10); // Pole

            // Invisible interactive zone
            const hitZone = this.add.zone(x, adjustedY - (this.diff.capacity * 25), 90, this.diff.capacity * 50 + 40).setInteractive();
            hitZone.on('pointerdown', () => this.handleTap(i));

            // Draw Rings
            for (let j = 0; j < this.state.rods[i].length; j++) {
                this.createRing(i, j, this.state.rods[i][j], x, adjustedY);
            }
        }
    }

    createRing(rodIndex, ringIndex, color, rodX, baseY) {
        const ringY = baseY - 20 - (ringIndex * 40);
        const ring = this.add.graphics();
        
        // Glossy Ring Effect
        ring.fillStyle(0x000000, 0.3).fillRoundedRect(rodX - 45, ringY - 20 + 5, 90, 40, 20); // Shadow
        ring.fillStyle(color, 1).fillRoundedRect(rodX - 45, ringY - 20, 90, 40, 20); // Main Color
        ring.fillStyle(0xFFFFFF, 0.4).fillRoundedRect(rodX - 35, ringY - 15, 70, 10, 5); // Highlight
        
        this.visualRings[rodIndex].push(ring);
    }

    handleTap(rodIndex) {
        if (!this.state.active || this.isAnimating) return;

        if (this.selectedRod === null) {
            // Select rod
            if (this.state.rods[rodIndex].length === 0) return; // Empty rod
            this.selectedRod = rodIndex;
            
            // Selection Animation
            const topRing = this.visualRings[rodIndex][this.visualRings[rodIndex].length - 1];
            this.tweens.add({ targets: topRing, y: -40, duration: 150, ease: 'Sine.easeOut' });
            
        } else {
            // Drop or Move
            if (this.selectedRod === rodIndex) {
                // Deselect
                const topRing = this.visualRings[rodIndex][this.visualRings[rodIndex].length - 1];
                this.tweens.add({ targets: topRing, y: 0, duration: 150, ease: 'Sine.easeIn' });
                this.selectedRod = null;
            } else {
                this.attemptMove(this.selectedRod, rodIndex);
            }
        }
    }

    attemptMove(from, to) {
        const fromRod = this.state.rods[from];
        const toRod = this.state.rods[to];
        const color = fromRod[fromRod.length - 1];

        // Validation
        if (toRod.length >= this.diff.capacity) { this.invalidMove(from); return; }
        if (toRod.length > 0 && toRod[toRod.length - 1] !== color) { this.invalidMove(from); return; }

        // Execute Move
        this.isAnimating = true;
        
        // Save History
        this.state.history.push({from, to});
        this.state.moves++;
        
        const ringColor = fromRod.pop();
        toRod.push(ringColor);

        const visualRing = this.visualRings[from].pop();
        
        // Calculate Positions
        const startX = 360 - ((this.diff.rods / 2) * 110) + 55;
        const targetX = (this.diff.rods > 6) ? (to % 5) * 135 + 90 : startX + (to * 110);
        const baseY = 950;
        const targetBaseY = (this.diff.rods > 6) ? ((to >= 5 ? baseY + 200 : baseY) - 350) : baseY;
        
        // Move Animation
        this.tweens.add({
            targets: visualRing,
            x: targetX - ((this.diff.rods > 6) ? (from % 5) * 135 + 90 : startX + (from * 110)),
            y: (targetBaseY - 20 - ((toRod.length - 1) * 40)) - (baseY - 20 - ((fromRod.length) * 40)),
            duration: 300,
            ease: 'Quad.easeInOut',
            onComplete: () => {
                this.visualRings[to].push(visualRing);
                this.selectedRod = null;
                this.isAnimating = false;
                this.checkWin();
            }
        });
    }

    invalidMove(rodIndex) {
        const topRing = this.visualRings[rodIndex][this.visualRings[rodIndex].length - 1];
        this.tweens.add({
            targets: topRing, x: { from: -5, to: 5 }, duration: 50, yoyo: true, repeat: 2,
            onComplete: () => {
                this.tweens.add({ targets: topRing, y: 0, x: 0, duration: 150 });
                this.selectedRod = null;
            }
        });
    }

    checkWin() {
        let won = true;
        for (let rod of this.state.rods) {
            if (rod.length > 0 && rod.length < this.diff.capacity) won = false;
            if (rod.length === this.diff.capacity) {
                const firstColor = rod[0];
                if (!rod.every(c => c === firstColor)) won = false;
            }
        }

        if (won) {
            this.state.active = false;
            this.scene.stop('UIScene');
            const totalTime = Math.floor((Date.now() - this.state.startTime) / 1000);
            
            // Save Progress
            const mm = Math.floor(totalTime / 60).toString().padStart(2, '0');
            const ss = (totalTime % 60).toString().padStart(2, '0');
            const formattedTime = `${mm}:${ss}`;
            
            let bestTime = localStorage.getItem('cm_best_time');
            if (!bestTime || totalTime < parseInt(localStorage.getItem('cm_best_time_raw') || Infinity)) {
                localStorage.setItem('cm_best_time', formattedTime);
                localStorage.setItem('cm_best_time_raw', totalTime);
            }
            
            let bestMoves = localStorage.getItem('cm_best_moves');
            if (!bestMoves || this.state.moves < parseInt(bestMoves)) {
                localStorage.setItem('cm_best_moves', this.state.moves);
            }

            this.scene.start('WinScene', { time: formattedTime, moves: this.state.moves, diff: this.diff });
        }
    }
}

class UIScene extends Phaser.Scene {
    constructor() { super({ key: 'UIScene', active: false }); }
    
    create() {
        this.gameScene = this.scene.get('GameScene');
        
        this.timerText = this.add.text(50, 50, '00:00', { fontSize: '40px', fill: '#fff', fontStyle: 'bold' });
        this.movesText = this.add.text(50, 100, 'Moves: 0', { fontSize: '32px', fill: '#ccc' });
        
        // Home Button
        const homeBtn = this.add.text(670, 50, '🏠', { fontSize: '40px' }).setOrigin(1, 0).setInteractive();
        homeBtn.on('pointerdown', () => {
            this.scene.stop('GameScene');
            this.scene.start('MenuScene');
        });

        // Restart Button
        const restartBtn = this.add.text(670, 120, '🔄', { fontSize: '40px' }).setOrigin(1, 0).setInteractive();
        restartBtn.on('pointerdown', () => {
            const diff = this.gameScene.diff;
            this.scene.stop('GameScene');
            this.scene.start('GameScene', diff);
        });
    }

    update() {
        if (this.gameScene.state && this.gameScene.state.active) {
            const elapsed = Math.floor((Date.now() - this.gameScene.state.startTime) / 1000);
            const m = Math.floor(elapsed / 60).toString().padStart(2, '0');
            const s = (elapsed % 60).toString().padStart(2, '0');
            this.timerText.setText(`${m}:${s}`);
            this.movesText.setText(`Moves: ${this.gameScene.state.moves}`);
        }
    }
}

class WinScene extends Phaser.Scene {
    constructor() { super('WinScene'); }
    
    init(data) { this.data = data; }

    create() {
        this.add.rectangle(360, 640, 720, 1280, 0x000000, 0.7);
        
        // Confetti
        for(let i=0; i<100; i++) {
            const color = Phaser.Utils.Array.GetRandom(COLORS);
            const piece = this.add.rectangle(Phaser.Math.Between(0, 720), -50, 15, 15, color);
            this.tweens.add({
                targets: piece,
                y: 1300,
                x: piece.x + Phaser.Math.Between(-200, 200),
                rotation: Phaser.Math.Between(0, 10),
                duration: Phaser.Math.Between(2000, 4000),
                delay: Phaser.Math.Between(0, 500)
            });
        }

        this.add.text(360, 400, 'PUZZLE COMPLETE!', { fontSize: '60px', fontStyle: 'bold', fill: '#00FF00' }).setOrigin(0.5);
        this.add.text(360, 500, `Time: ${this.data.time}\nMoves: ${this.data.moves}`, { fontSize: '40px', fill: '#ffffff', align: 'center' }).setOrigin(0.5);

        // Buttons
        this.createButton(360, 700, 'NEXT LEVEL', () => {
            this.scene.start('GameScene', this.data.diff);
            this.scene.start('UIScene');
        });
        
        this.createButton(360, 850, 'MAIN MENU', () => {
            this.scene.start('MenuScene');
        });
    }

    createButton(x, y, text, callback) {
        const btn = this.add.container(x, y);
        const bg = this.add.graphics();
        bg.fillStyle(0x4a4e69, 1).fillRoundedRect(-150, -40, 300, 80, 20);
        const txt = this.add.text(0, 0, text, { fontSize: '30px', fill: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
        btn.add([bg, txt]);
        
        const hitArea = new Phaser.Geom.Rectangle(-150, -40, 300, 80);
        btn.setInteractive(hitArea, Phaser.Geom.Rectangle.Contains);
        btn.on('pointerdown', callback);
    }
}

// Init Game
const game = new Phaser.Game(CONFIG);
CONFIG.scene.push(BootScene, MenuScene, GameScene, UIScene, WinScene);
