import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { Camera } from "@babylonjs/core/Cameras/camera";
import { Color4, Color3 } from "@babylonjs/core/Maths/math.color";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";


import { PointerEventTypes } from "@babylonjs/core/Events/pointerEvents";
import { KeyboardEventTypes } from "@babylonjs/core/Events/keyboardEvents";

import { createSimpleMaterial } from "./materials/simpleMaterial";

import { InkCanvas } from "./inkCanvas";
import { Mesh, StandardMaterial } from "@babylonjs/core";

// Find our elements
const mainCanvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
const fpsDiv = document.getElementById("fps") as HTMLCanvasElement;
const undoBtn = document.getElementById("undo") as HTMLElement;
const redoBtn = document.getElementById("redo") as HTMLElement;
const clearBtn = document.getElementById("clear") as HTMLElement;
const size1Btn = document.getElementById("size1") as HTMLElement;
const size5Btn = document.getElementById("size5") as HTMLElement;
const size15Btn = document.getElementById("size15") as HTMLElement;
const blackBtn = document.getElementById("black") as HTMLElement;
const whiteBtn = document.getElementById("white") as HTMLElement;

/**
 * Can be set to enter in debug mode.
 * Materials will be wireframed and inputs will be debounced
 */
const debug = false;


function createEngine() {
    // Create our engine to hold on the canvas
    const engine = new Engine(mainCanvas, true, { 
        preserveDrawingBuffer: false,
        alpha: false,
    });
    engine.preventCacheWipeBetweenFrames = true;
    return engine;
}

function createScene(engine) {
    // Create a scene to ink with
    const scene = new Scene(engine);

    // no need to clear here as we do not preserve buffers
    scene.autoClearDepthAndStencil = false;

    // Ensures default is part of our supported use cases.
    scene.defaultMaterial = createSimpleMaterial("default", scene, Color3.White());

    // Add a camera to the scene
    const camera = new FreeCamera("orthoCamera", new Vector3(0, 0, -6), scene);

    // Rely on the underlying engine render loop to update the filter result every frame.
    engine.runRenderLoop(() => {
        scene.render();
    });

    return scene;
}

const engine = createEngine();
const scene = createScene(engine);


// Create our inking surface
const inkCanvas = new InkCanvas(scene, debug);


// Timer Events
setInterval(() => {
    fpsDiv.innerText = "FPS: " + inkCanvas.getFps().toFixed(2);
}, 1000);

// Keyboard events
inkCanvas.onKeyboardObservable.add((e) => {
    if (e.type === KeyboardEventTypes.KEYDOWN) {
        if (e.event.ctrlKey) {
            // Undo
            if (e.event.key === 'z') {
                inkCanvas.undo();
            }
            // Redo
            else if (e.event.key === 'y') {
                inkCanvas.redo();
            }
            // Clear
            else if (e.event.key === 'c') {
                inkCanvas.clear();
            }
            // Debug
            else if (e.event.key === 'i') {
                inkCanvas.toggleDebugLayer();
            }
        }
    }
});

// Pointer events
inkCanvas.onPointerObservable.add((e) => {
    // Create
    if(e.type == PointerEventTypes.POINTERDOWN){
        inkCanvas.startPath();
    }
    // Trace
    else if(e.type == PointerEventTypes.POINTERMOVE){
        inkCanvas.extendPath();
    }
    // Release
    else if(e.type == PointerEventTypes.POINTERUP){
        inkCanvas.endPath();
    }
});

// Buttons Events
undoBtn.onclick = () => {
    inkCanvas.undo();
};
redoBtn.onclick = () => {
    inkCanvas.redo();
};
clearBtn.onclick = () => {
    inkCanvas.clear();
};
size1Btn.onclick = () => {
    inkCanvas.changeSize(1);
};
size5Btn.onclick = () => {
    inkCanvas.changeSize(5);
};
size15Btn.onclick = () => {
    inkCanvas.changeSize(15);
};
blackBtn.onclick = () => {
    inkCanvas.changeColor(Color3.Black());
};
whiteBtn.onclick = () => {
    inkCanvas.changeColor(Color3.White());
};