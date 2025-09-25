// element: a jQuery object containing the DOM element to use
// dimensions: the number of cubes per row/column (default 3)
// background: the scene background colour
function Rubik(element, dimensions, background) {

  dimensions = dimensions || 3;
  background = background || 0x303030;

  var width = element.innerWidth(),
      height = element.innerHeight();

  var debug = false;

  /*** three.js boilerplate ***/
  var scene = new THREE.Scene(),
      camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000),
      renderer = new THREE.WebGLRenderer({ antialias: true });

  renderer.setClearColor(background, 1.0);
  renderer.setSize(width, height);
  renderer.shadowMapEnabled = true;
  element.append(renderer.domElement);

  camera.position = new THREE.Vector3(-20, 20, 30);
  camera.lookAt(scene.position);
  THREE.Object3D._threexDomEvent.camera(camera);

  /*** Lights ***/
  scene.add(new THREE.AmbientLight(0xffffff));
  //TODO: add a spotlight that takes the orbitcontrols into account to stay "static"

  /*** Camera controls ***/
  var orbitControl = new THREE.OrbitControls(camera, renderer.domElement);

  function enableCameraControl() {
    orbitControl.noRotate = false;
  }

  function disableCameraControl() {
    orbitControl.noRotate = true;
  }

  /*** Debug aids ***/  
  if(debug) {
    scene.add(new THREE.AxisHelper( 20 ));
  }

  /*** Click handling ***/

  //Do the given coordinates intersect with any cubes?
  var SCREEN_HEIGHT = window.innerHeight;
  var SCREEN_WIDTH = window.innerWidth;

  var raycaster = new THREE.Raycaster(),
      projector = new THREE.Projector();

  function isMouseOverCube(mouseX, mouseY) {
    var directionVector = new THREE.Vector3();

    //Normalise mouse x and y
    var x = ( mouseX / SCREEN_WIDTH ) * 2 - 1;
    var y = -( mouseY / SCREEN_HEIGHT ) * 2 + 1;

    directionVector.set(x, y, 1);

    projector.unprojectVector(directionVector, camera);
    directionVector.sub(camera.position);
    directionVector.normalize();
    raycaster.set(camera.position, directionVector);

    return raycaster.intersectObjects(allCubes, true).length > 0;
  }

  //Return the axis which has the greatest maginitude for the vector v
  function principalComponent(v) {
    var maxAxis = 'x',
        max = Math.abs(v.x);
    if(Math.abs(v.y) > max) {
      maxAxis = 'y';
      max = Math.abs(v.y);
    }
    if(Math.abs(v.z) > max) {
      maxAxis = 'z';
      max = Math.abs(v.z);
    }
    return maxAxis;
  }

  //For each mouse down, track the position of the cube that
  // we clicked (clickVector) and the face object that we clicked on 
  // (clickFace)
  var clickVector, clickFace;

  //Keep track of the last cube that the user's drag exited, so we can make
  // valid movements that end outside of the Rubik's cube
  var lastCube;

  var onCubeMouseDown = function(e, cube) {
    disableCameraControl();

    //Maybe add move check in here
    if(true || !isMoving) {
      clickVector = cube.rubikPosition.clone();
      
      var centroid = e.targetFace.centroid.clone();
      centroid.applyMatrix4(cube.matrixWorld);

      //Which face (of the overall cube) did we click on?
      if(nearlyEqual(Math.abs(centroid.x), maxExtent))
        clickFace = 'x';
      else if(nearlyEqual(Math.abs(centroid.y), maxExtent))
        clickFace = 'y';
      else if(nearlyEqual(Math.abs(centroid.z), maxExtent))
        clickFace = 'z';    
    }  
  };

  //Matrix of the axis that we should rotate for 
  // each face-drag action
  //    F a c e
  // D    X Y Z
  // r  X - Z Y
  // a  Y Z - X
  // g  Z Y X -
  var transitions = {
    'x': {'y': 'z', 'z': 'y'},
    'y': {'x': 'z', 'z': 'x'},
    'z': {'x': 'y', 'y': 'x'}
  }

  var onCubeMouseUp = function(e, cube) {

    if(clickVector) {
      //TODO: use the actual mouse end coordinates for finer drag control
      var dragVector = cube.rubikPosition.clone();
      dragVector.sub(clickVector);

      //Don't move if the "drag" was too small, to allow for 
      // click-and-change-mind.
      if(dragVector.length() > cubeSize) {

        //Rotate with the most significant component of the drag vector
        // (excluding the current axis, because we can't rotate that way)
        var dragVectorOtherAxes = dragVector.clone();
        dragVectorOtherAxes[clickFace] = 0;

        var maxAxis = principalComponent(dragVectorOtherAxes);

        var rotateAxis = transitions[clickFace][maxAxis],
            direction = dragVector[maxAxis] >= 0 ? 1 : -1;
        
        //Reverse direction of some rotations for intuitive control
        //TODO: find a general solution!
        if(clickFace == 'z' && rotateAxis == 'x' || 
           clickFace == 'x' && rotateAxis == 'z' ||
           clickFace == 'y' && rotateAxis == 'z')
          direction *= -1;

        if(clickFace == 'x' && clickVector.x > 0 ||
           clickFace == 'y' && clickVector.y < 0 ||
           clickFace == 'z' && clickVector.z < 0)
          direction *= -1;

        pushMove(cube, clickVector.clone(), rotateAxis, direction);
        startNextMove();
        enableCameraControl();
      } else {
        console.log("Drag me some more please!");
      }
    }
  };

  //If the mouse was released outside of the Rubik's cube, use the cube that the mouse 
  // was last over to determine which move to make
  var onCubeMouseOut = function(e, cube) {
    //TODO: there is a possibility that, at some rotations, we may catch unintentional
    // cubes on the way out. We should check that the selected cube is on the current
    // drag vector.
    lastCube = cube;
  }

  element.on('mouseup', function(e) {
    if(!isMouseOverCube(e.clientX, e.clientY)) {
      if(lastCube)
        onCubeMouseUp(e, lastCube);
    }
  });

  /*** Build 27 cubes ***/
  //TODO: colour the insides of all of the faces black
  // (probably colour all faces black to begin with, then "whitelist" exterior faces)
  var colours = [0xC41E3A, 0x009E60, 0x0051BA, 0xFF5800, 0xFFD500, 0xFFFFFF],
      faceMaterials = colours.map(function(c) {
        return new THREE.MeshLambertMaterial({ color: c , ambient: c });
      }),
      cubeMaterials = new THREE.MeshFaceMaterial(faceMaterials);

  var cubeSize = 3,
      spacing = 0.5;

  var increment = cubeSize + spacing,
      maxExtent = (cubeSize * dimensions + spacing * (dimensions - 1)) / 2, 
      allCubes = [];

  function checkSolvedByScreenshot() {
    // 1. render
    renderer.render(scene, camera);

    // 2. ideiglenes 2D canvas
    var canvas = renderer.domElement;
    var tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    var ctx = tempCanvas.getContext('2d');

    // 3. kép beolvasása
    var imgData = canvas.toDataURL();
    var img = new Image();
    img.onload = function() {
        ctx.drawImage(img, 0, 0);

        // 4. pixeladatok kivágása (pl. középső harmad)
        var startX = canvas.width / 3;
        var startY = canvas.height / 3;
        var width = canvas.width / 3;
        var height = canvas.height / 3;
        var imageData = ctx.getImageData(startX, startY, width, height);
        var data = imageData.data;

        // 5. ismert színek
        var knownColors = [
            {r: 196, g: 30, b: 58},   // piros 0xC41E3A
            {r: 0, g: 158, b: 96},    // zöld 0x009E60
            {r: 0, g: 81, b: 186},    // kék 0x0051BA
            {r: 255, g: 88, b: 0},    // narancs 0xFF5800
            {r: 255, g: 213, b: 0},   // sárga 0xFFD500
            {r: 255, g: 255, b: 255}, // fehér 0xFFFFFF
            {r: 48, g: 48, b: 48}     // háttér 0x303030
        ];

        // 6. helper: legközelebbi szín keresése
        function closestColor(r, g, b) {
            let minDist = Infinity;
            let closest = null;
            for (let c of knownColors) {
                let dist = Math.pow(c.r - r, 2) + Math.pow(c.g - g, 2) + Math.pow(c.b - b, 2);
                if (dist < minDist) {
                    minDist = dist;
                    closest = `${c.r},${c.g},${c.b}`;
                }
            }
            return closest;
        }

        // 7. összegyűjtés
        var colors = new Set();
        for (var i = 0; i < data.length; i += 4) {
            var r = data[i], g = data[i+1], b = data[i+2];
            var col = closestColor(r, g, b);
            colors.add(col);
        }

        console.log("Talált színek:", colors);

        if (colors.size <= 4) { // 6 kockaszín + háttér
            console.log("A Rubik kocka kész!");
            showPrize(); // ha akarod a nyereményt
        }
    };

    img.src = imgData;
  }


  function newCube(x, y, z) {
    var cubeGeometry = new THREE.CubeGeometry(cubeSize, cubeSize, cubeSize);
    var cube = new THREE.Mesh(cubeGeometry, cubeMaterials);
    cube.castShadow = true;

    cube.position = new THREE.Vector3(x, y, z);
    cube.rubikPosition = cube.position.clone();

    cube.on('mousedown', function(e) {
      onCubeMouseDown(e, cube);
    });

    cube.on('mouseup', function(e) {
      onCubeMouseUp(e, cube);
    });

    cube.on('mouseout', function(e) {
      onCubeMouseOut(e, cube);
    });

    scene.add(cube);
    allCubes.push(cube);
  }

  var positionOffset = (dimensions - 1) / 2;
  for(var i = 0; i < dimensions; i ++) {
    for(var j = 0; j < dimensions; j ++) {
      for(var k = 0; k < dimensions; k ++) {

        var x = (i - positionOffset) * increment,
            y = (j - positionOffset) * increment,
            z = (k - positionOffset) * increment;

        newCube(x, y, z);
      }
    }
  }

  /*** Manage transition states ***/

  //TODO: encapsulate each transition into a "Move" object, and keep a stack of moves
  // - that will allow us to easily generalise to other states like a "hello" state which
  // could animate the cube, or a "complete" state which could do an animation to celebrate
  // solving.
  var moveEvents = $({});

  //Maintain a queue of moves so we can perform compound actions like shuffle and solve
  var moveQueue = [],
      completedMoveStack = [],
      currentMove;

  //Are we in the middle of a transition?
  var isMoving = false,
      moveAxis, moveN, moveDirection,
      rotationSpeed = 0.2;

  //http://stackoverflow.com/questions/20089098/three-js-adding-and-removing-children-of-rotated-objects
  var pivot = new THREE.Object3D(),
      activeGroup = [];

  function nearlyEqual(a, b, d) {
    d = d || 0.001;
    return Math.abs(a - b) <= d;
  }

  //Select the plane of cubes that aligns with clickVector
  // on the given axis
  function setActiveGroup(axis) {
    if(clickVector) {
      activeGroup = [];

      allCubes.forEach(function(cube) {
        if(nearlyEqual(cube.rubikPosition[axis], clickVector[axis])) { 
          activeGroup.push(cube);
        }
      });
    } else {
      console.log("Nothing to move!");
    }
  }

  var pushMove = function(cube, clickVector, axis, direction) {
    moveQueue.push({ cube: cube, vector: clickVector, axis: axis, direction: direction });
  }

  var startNextMove = function() {
    var nextMove = moveQueue.pop();

    if(nextMove) {
      clickVector = nextMove.vector;
      
      var direction = nextMove.direction || 1,
          axis = nextMove.axis;

      if(clickVector) {

        if(!isMoving) {
          isMoving = true;
          moveAxis = axis;
          moveDirection = direction;

          setActiveGroup(axis);

          pivot.rotation.set(0,0,0);
          pivot.updateMatrixWorld();
          scene.add(pivot);

          activeGroup.forEach(function(e) {
            THREE.SceneUtils.attach(e, scene, pivot);
          });

          currentMove = nextMove;
        } else {
          console.log("Already moving!");
        }
      } else {
        console.log("Nothing to move!");
      }
    } else {
      moveEvents.trigger('deplete');
    }
  }

  function doMove() {
    //Move a quarter turn then stop
    if(pivot.rotation[moveAxis] >= Math.PI / 2) {
      //Compensate for overshoot. TODO: use a tweening library
      pivot.rotation[moveAxis] = Math.PI / 2;
      moveComplete();
    } else if(pivot.rotation[moveAxis] <= Math.PI / -2) {
      pivot.rotation[moveAxis] = Math.PI / -2;
      moveComplete()
    } else {
      pivot.rotation[moveAxis] += (moveDirection * rotationSpeed);
    }
  }

  var moveComplete = function() {
    isMoving = false;
    moveAxis, moveN, moveDirection = undefined;
    clickVector = undefined;

    pivot.updateMatrixWorld();
    scene.remove(pivot);
    activeGroup.forEach(function(cube) {
      cube.updateMatrixWorld();

      cube.rubikPosition = cube.position.clone();
      cube.rubikPosition.applyMatrix4(pivot.matrixWorld);

      THREE.SceneUtils.detach(cube, pivot, scene);
    });

    completedMoveStack.push(currentMove);

    moveEvents.trigger('complete');

    // Ellenőrzés a kirakottságra
    if(checkSolvedByScreenshot()) {
        console.log("A Rubik kocka kész!");
        showPrize(); // ha szeretnéd megjeleníteni a nyereményt
    }

    //Are there any more queued moves?
    startNextMove();
  }


  function render() {

    //States
    //TODO: generalise to something like "activeState.tick()" - see comments 
    // on encapsulation above
    if(isMoving) {
      doMove();
    } 

    renderer.render(scene, camera);
    requestAnimationFrame(render);
  }

  /*** Util ***/
  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min);
  }

  //Go!
  render();

  //Public API
  return {
    shuffle: function() {
      function randomAxis() {
        return ['x', 'y', 'z'][randomInt(0,2)];
      }

      function randomDirection() {
        var x = randomInt(0,1);
        if(x == 0) x = -1;
        return x;
      }

      function randomCube() {
        var i = randomInt(0, allCubes.length - 1);
        //TODO: don't return a centre cube
        return allCubes[i];
      }

      var nMoves = randomInt(1, 2);
      for(var i = 0; i < nMoves; i ++) {
        //TODO: don't reselect the same axis?
        var cube = randomCube();
        pushMove(cube, cube.position.clone(), randomAxis(), randomDirection());
      }

      startNextMove();
    },

    //A naive solver - step backwards through all completed steps
    solve: function() {
      if(!isMoving) {
        var solved;

        completedMoveStack.forEach(function(move) {
          pushMove(move.cube, move.vector, move.axis, move.direction * -1);
        });

        //Don't remember the moves we're making whilst solving
        completedMoveStack = [];

        moveEvents.one('deplete', function() {
          completedMoveStack = [];
        });

        startNextMove();

      }
    },

    //Rewind the last move
    undo: function() {
      if(!isMoving) {
        var lastMove = completedMoveStack.pop();
        if(lastMove) {
          //clone
          var stackToRestore = completedMoveStack.slice(0);
          pushMove(lastMove.cube, lastMove.vector, lastMove.axis, lastMove.direction * -1);

          moveEvents.one('complete', function() {
            completedMoveStack = stackToRestore;
          });

          startNextMove();
        }
      }
    }
  }
}


/*
function showPrize() {
  //alert("Buksisimi");
  alert("https://www.pornhub.com/view_video.php?viewkey=64fe027320120")  
}
*/


function showPrize(videoUrl) {
  // Példa fallback: ha nincs megadva URL, a repo főoldalra vezető link jelenik meg
  var defaultLink = "https://github.com/pupppeter/rubik_levi";
  var url = videoUrl || defaultLink;
  url = "https://raw.githubusercontent.com/pupppeter/rubik_levi/main/Strip_80.mp4"

  // Ha már van nyitva popup, ne duplikáljuk
  if (document.getElementById("prize-popup-overlay")) return;

  // Stílus (egyszer rakjuk be)
  if (!document.getElementById("prize-popup-style")) {
    var style = document.createElement("style");
    style.id = "prize-popup-style";
    style.innerHTML = `
      #prize-popup-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.6);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        animation: fadeIn 240ms ease;
      }
      #prize-popup-modal {
        position: relative;
        background: #111;
        border-radius: 12px;
        padding: 18px;
        max-width: 90vw;
        max-height: 85vh;
        box-shadow: 0 12px 40px rgba(0,0,0,0.6);
        transform: scale(0.85);
        animation: popIn 420ms cubic-bezier(.2,.8,.2,1) forwards;
        color: #fff;
      }
      #prize-popup-modal .title { font-size: 18px; margin-bottom: 8px; text-align:center; }
      #prize-video { display:block; max-width: 80vw; max-height: 60vh; width: 720px; height: auto; border-radius: 8px; background: #000; }
      #prize-popup-modal .actions { margin-top: 10px; text-align:center; }
      .prize-btn {
        display: inline-block; padding: 12px 20px; border-radius: 12px; text-decoration:none; font-weight:700;
        background: linear-gradient(90deg,#ff007a,#ff8c00); color:#fff;
        font-size: 16px;
        transition: transform 0.2s ease;
      }
      .prize-btn:hover {
        transform: scale(1.05);
      }
      .prize-close {
        position: absolute; right: 16px; top: 14px; background:transparent; border: none; color: #fff; font-size:20px; cursor:pointer;
      }

      /* Extra üzenetek */
      .extra-message {
        position: fixed;
        left: 50%;
        top: 33%;
        transform: translateX(-50%) translateY(20px);
        padding: 12px 20px;
        border-radius: 10px;
        font-weight: bold;
        font-size: 16px;
        opacity: 0;
        animation: slideIn 0.6s ease forwards;
        z-index: 10001;
        pointer-events: none; /* ne takarja a videót */
        max-width: 90%;
        text-align: center;
      }
      #zsombi-message { background: rgba(255,0,0,0.85); color: #fff; }
      #szabolcs-message { background: rgba(255,255,0,0.9); color: #000; }

      /* Star Wars szöveg crawl */
      #starwars-container {
        position: relative;
        width: 100%;
        height: 60vh;
        overflow: hidden;
        background: url('yoda.gif') center center / cover no-repeat;
        border-radius: 8px;
        perspective: 400px;
      }
      #starwars-text {
        position: absolute;
        bottom: -100%;
        width: 90%;
        left: 5%;
        font-size: 20px;
        font-weight: bold;
        text-align: justify;
        color: #ffe81f;
        line-height: 1.6;
        transform-origin: 50% 100%;
        transform: rotateX(25deg);
        animation: crawl 60s linear forwards;
      }
      @keyframes crawl {
        0%   { bottom: -100%; }
        100% { bottom: 120%; }
      }

      @keyframes slideIn {
        from { opacity: 0; transform: translateX(-50%) translateY(40px); }
        to   { opacity: 1; transform: translateX(-50%) translateY(0); }
      }

      @keyframes popIn {
        0% { transform: scale(0.85) translateY(8px); opacity: 0; }
        60% { transform: scale(1.05) translateY(-6px); opacity: 1; }
        100% { transform: scale(1) translateY(0); opacity: 1; }
      }
      @keyframes fadeIn {
        from { opacity: 0 } to { opacity: 1 }
      }
    `;
    document.head.appendChild(style);
  }

  // Overlay + modal
  var overlay = document.createElement("div");
  overlay.id = "prize-popup-overlay";

  var modal = document.createElement("div");
  modal.id = "prize-popup-modal";
  modal.innerHTML = `
    <button class="prize-close" aria-label="Bezárás">&times;</button>
    <div class="title">🎉 Gratulálok — győzelem! 🎉</div>
    <div class="video-wrap">
      <video id="prize-video" controls playsinline preload="metadata">
        <source src="${url}" type="video/mp4">
        A böngésződ nem támogatja a beágyazott videót. <a href="${url}" target="_blank" rel="noopener noreferrer">Megnyitás</a>
      </video>
    </div>
    <div class="actions">
      <a class="prize-btn" href="${url}" target="_blank" rel="noopener noreferrer">
        🎂 Boldog 18. születésnapot Fákó Levente! 🎂
      </a>
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Close: kattintás kívülre, close gomb, ESC
  overlay.addEventListener("click", function(e) {
    if (e.target === overlay) removePopup();
  });
  modal.querySelector(".prize-close").addEventListener("click", removePopup);
  document.addEventListener("keydown", onEsc);

  function onEsc(e) {
    if (e.key === "Escape") removePopup();
  }

  function removePopup() {
    document.removeEventListener("keydown", onEsc);
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
  }

  // Próbáljuk automatikusan elindítani (böngészők gyakran blokkolják a hanggal történő autoplay-t)
  var videoEl = modal.querySelector("#prize-video");
  if (videoEl) {
    // Autoplay-hoz sok böngésző engedi, ha a videó némított
    videoEl.muted = true;
    var playPromise = videoEl.play();
    if (playPromise !== undefined) {
      playPromise.catch(function(err) {
        // autoplay blokkolva — a felhasználónak kattintania kell
        // marad a controls + "Megnyitás új lapon" gomb
        console.log("Autoplay blocked or not allowed:", err);
      }).then(function() {
        // Ha sikerült játszani, majd visszaállíthatjuk a némítást, ha szeretnéd:
        // videoEl.muted = false; // <-- csak akkor állítsd vissza, ha biztosan kellett
      });
    }

    let zsombiTimeout, szabolcsTimeout;

    videoEl.addEventListener("play", function() {
      // Zsombi üzenet 60 mp után
      setTimeout(() => {
        if (!document.getElementById("zsombi-message")) {
          var msg = document.createElement("div");
          msg.id = "zsombi-message";
          msg.className = "extra-message";
          msg.textContent = "Zsombi, get out from room, this is not for your eyes! :)";
          document.body.appendChild(msg);

          // automatikus eltűnés 8 mp után
            setTimeout(() => {
              msg.style.transition = "opacity 0.6s ease, transform 0.6s ease";
              msg.style.opacity = "0";
              msg.style.transform = "translateX(-50%) translateY(40px)";
              setTimeout(() => msg.remove(), 800);
            }, 8000);
          }
      }, 60000);

      // Szabolcs üzenet 100 mp után
      setTimeout(() => {
        if (!document.getElementById("szabolcs-message")) {
          var msg2 = document.createElement("div");
          msg2.id = "szabolcs-message";
          msg2.className = "extra-message";
          msg2.textContent = "Szabolcs, you're watching this illegally. But I think you have better links than this :)";
          document.body.appendChild(msg2);

          // automatikus eltűnés 10 mp után
          setTimeout(() => {
            msg2.style.transition = "opacity 0.6s ease, transform 0.6s ease";
            msg2.style.opacity = "0";
            msg2.style.transform = "translateX(-50%) translateY(40px)";
            setTimeout(() => msg2.remove(), 600);
          }, 10000);
        }
      }, 100000);
    });
    // 👇 Videó vége → Star Wars szöveg crawl
    videoEl.addEventListener("ended", function() {
      var videoWrap = modal.querySelector(".video-wrap");
      if (videoWrap) {
        videoWrap.innerHTML = `
          <div id="starwars-container">
            <div id="starwars-text">
              Leila hercegnőt sajnos nem találtam, de azért remélem tetszett :D<br><br>
              Sok sikert az életben és persze: Az Erő legyen veled!<br><br>
              Ezennel rád hagyom a projektet, játssz vele :)<br><br>
              <a href="https://github.com/pupppeter/rubik_levi" target="_blank" style="color:#fff">https://github.com/pupppeter/rubik_levi</a>
            </div>
          </div>
        `;
      }
    });
  }
}
