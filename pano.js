function Class(base, constructor, methods) {
    // Create a new object as this class prototype based on the base objects
    // prototype. This is way, functions added to the new prototype won't be
    // added to the base class prototype.
    constructor.prototype = Object.create(base.prototype);

    // Add methods to the prototype.
    if(methods != undefined) {
        for(var name in methods) {
            constructor.prototype[name] = methods[name];
        }
    }

    return constructor;
}

var FPS = 30;
var DEG2RAD = Math.PI/180.0;
// var widthToHeight = 4 / 3;
var widthToHeight = 16 / 9;

//Canvas to which to draw the panorama
var pano_canvas = null;
var target = null;
var source = null;

//Event state
var mouseIsDown = false;
var mouseDownPosLastX = 0;
var mouseDownPosLastY = 0;
var displayMenu = true;
var displayInfo = false;
var displayHelp = false;

//Camera state
var base_heading = 0;
var cam_heading = base_heading;
var cam_pitch = 90.0;
var cam_fov = 90;

//Load image
var img_buffer = null;
var img = new Image();
img.onload = imageLoaded;

var renderer = null;

function init_pano(canvasId, image){
  //get canvas and set up callbacks
  pano_canvas = document.getElementById(canvasId);
  pano_canvas.onmousedown = mouseDown;
  window.onmousemove = mouseMove;
  window.onmouseup = mouseUp;
  window.onmousewheel = mouseScroll;
  window.onkeydown = keyDown;

  window.addEventListener('resize', resizeCanvas, false);
  window.addEventListener('orientationchange', resizeCanvas, false);

  setImage(image);
  renderer = new WebGLRenderer(pano_canvas);
  renderer.init();
}

function setImage(imageData) {
  img.src = imageData;
}

function resizeCanvas() {
  var container = document.getElementById('container');
  var newWidth = window.innerWidth;
  var newHeight = window.innerHeight;
  var newWidthToHeight = newWidth / newHeight;

  if (newWidthToHeight > widthToHeight) {
    newWidth = newHeight * widthToHeight;
    container.style.height = newHeight + 'px';
    container.style.width = newWidth + 'px';
  } else {
    newHeight = newWidth / widthToHeight;
    container.style.height = newHeight + 'px';
    container.style.width = newWidth + 'px';
  }

  container.style.marginTop = (-newHeight / 2) + 'px';
  container.style.marginLeft = (-newWidth / 2) + 'px';

  pano_canvas.width = newWidth;
  pano_canvas.height = newHeight;

  target = null;
  renderer.resize();
  renderer.draw();
}

function imageLoaded(){
  var buffer = document.createElement("canvas");
  var buffer_ctx = buffer.getContext("2d");

  //set buffer size
  var tex_resolution = 4096;
  buffer.width = tex_resolution;
  buffer.height = tex_resolution;

  //draw image
  var scale = tex_resolution / img.width;
  buffer_ctx.drawImage(img,
          0, (tex_resolution - img.height * scale) / 2,
          tex_resolution, img.height * scale);

  //get pixels
  source = buffer_ctx.getImageData(0, 0, tex_resolution, tex_resolution);
  renderer.set_image(source, img.height * scale);

  resizeCanvas();
}

function mouseDown(e){
  mouseIsDown = true;
  mouseDownPosLastX = e.clientX;
  mouseDownPosLastY = e.clientY;
}

function mouseMove(e){
  if(mouseIsDown == true){
    cam_heading += 0.25*(e.clientX-mouseDownPosLastX);
    cam_pitch += 0.25*(e.clientY-mouseDownPosLastY);
    mouseDownPosLastX = e.clientX;
    mouseDownPosLastY = e.clientY;
    renderer.draw();
  }
}

function mouseUp(e){
  mouseIsDown = false;
  renderer.draw();
}

function mouseScroll(e){
  cam_fov+=e.wheelDelta/120;
  renderer.draw();
}

function keyDown(e) {
  switch(e.keyCode) {
    // i = info
    case 73:
      displayInfo = !displayInfo;
      renderer.draw();
      break;
    // m = menu
    case 77:
      displayMenu = !displayMenu;
      renderer.draw();
      break;
    // ? = help
    case 191:
      displayHelp = !displayHelp;
      renderer.draw();
      break;
    default:
      console.log("key: ", e.keyCode);
  }
}

function drawLine(pixels, scanwidth, xofs, x0, y0, x1, y1) {
  var dx = Math.abs(x1 - x0);
  var dy = -Math.abs(y1 - y0);
  var sx = (x0 < x1) ? 1 : -1;
  var sy = (y0 < y1) ? 1 : -1;
  var err1 = dx + dy;
  var err2;

  var x = x0;
  var y = y0;

  while(true) {
    var offset=4*(y * scanwidth + x + xofs);
    pixels[offset]   = 0xff;
    pixels[offset+1] = 0x00;
    pixels[offset+2] = 0x00;
    if (x == x1 && y == y1)
      break;
    err2 = 2*err1;
    if(err2 > dy) {
      err1 += dy;
      x += sx;
    }
    if(err2 < dx) {
      err1 += dx;
      y += sy;
    }
  }
}

WebGLRenderer = Class(Object,
    function WebGLRenderer(canvas) {
        this.canvas = canvas;
        this.gl = this.canvas.getContext('webkit-3d');
    },
    {
        init: function(img) {
            var vertex_shader = this.load_shader(this.gl.VERTEX_SHADER,
                this.get_text('vertex_shader'));
            var fragment_shader = this.load_shader(this.gl.FRAGMENT_SHADER,
                this.get_text('fragment_shader'));
            this.program = this.gl.createProgram();
            this.gl.attachShader(this.program, vertex_shader);
            this.gl.attachShader(this.program, fragment_shader);

            this.gl.linkProgram(this.program);
            if(!this.gl.getProgramParameter(this.program, this.gl.LINK_STATUS)) {
                console.log(this.gl.getProgramInfoLog(program));
            }

            this.gl.useProgram(this.program);

            // Get locations of shader variables.
            this.attribs = {
                vertex: this.gl.getAttribLocation(this.program, 'vertex'),
                texture: this.gl.getUniformLocation(this.program, 'texture_img'),
                texture_size: this.gl.getUniformLocation(this.program, 'texture_size'),
                panorama_height: this.gl.getUniformLocation(this.program, 'panorama_height'),
                viewport_size: this.gl.getUniformLocation(this.program, 'viewport_size'),
                cam_up: this.gl.getUniformLocation(this.program, 'cam_up'),
                cam_right: this.gl.getUniformLocation(this.program, 'cam_right'),
                cam_plane: this.gl.getUniformLocation(this.program, 'cam_plane'),
            }

            // Prepare texture (even if there is no image data available).
            this.texture = this.gl.createTexture();
            this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
            this.gl.texParameteri(this.gl.TEXTURE_2D,
                    this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
            this.gl.texParameteri(this.gl.TEXTURE_2D,
                    this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
            this.gl.uniform1i(this.attribs.texture, 0);
            this.gl.activeTexture(this.gl.TEXTURE0);

            // Create buffer for vertex data (only one quad).
            this.vertex_buffer = this.gl.createBuffer();
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertex_buffer);
            this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array([
                    -1, 1, 0,
                    1, 1, 0,
                    -1, -1, 0,
                    1, -1, 0
                     ]), this.gl.STATIC_DRAW);

            // Enable vertex buffer and set shader variable.
            this.gl.enableVertexAttribArray(this.attribs.vertex);
            this.gl.vertexAttribPointer(this.attribs.vertex, 3, this.gl.FLOAT,
                    false, 3*4, 0*4);
        },
        set_image: function(data, panorama_height) {
            // Upload image as texture and set dimension variables.
            this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA,
                   this.gl.UNSIGNED_BYTE, data);
            this.gl.uniform1i(this.attribs.texture, 0);
            this.gl.uniform2f(this.attribs.texture_size,
                    data.width, data.height);
            this.gl.uniform1f(this.attribs.panorama_height, panorama_height);
            this.img_width = data.width;
            this.img_height = data.height;
        },
        get_text: function(elem_id) {
            var elem = document.getElementById(elem_id);
            var source = '';
            var child = elem.firstChild;
            while(child) {
                if(child.nodeType == 3) {
                    source += child.textContent;
                }
                child = child.nextSibling;
            }
            return source;
        },
        load_shader: function(shader_type, shader_code) {
            var shader = this.gl.createShader(shader_type);
            this.gl.shaderSource(shader, shader_code);
            this.gl.compileShader(shader);

            if(!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
                console.log(this.gl.getShaderInfoLog(shader));
            }

            return shader;
        },
        resize: function() {
            this.gl.uniform2f(this.attribs.viewport_size,
                    this.canvas.width, this.canvas.height);
            this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        },
        draw: function() {
            var ratioUp = Math.tan(cam_fov*DEG2RAD/2.0);
            var ratioRight = ratioUp*(this.canvas.width / this.canvas.height);
            var camDirX = Math.sin(cam_pitch*DEG2RAD)*Math.sin(cam_heading*DEG2RAD);
            var camDirY = Math.cos(cam_pitch*DEG2RAD);
            var camDirZ = Math.sin(cam_pitch*DEG2RAD)*Math.cos(cam_heading*DEG2RAD);
            var camUpX = ratioUp*Math.sin((cam_pitch-90.0)*DEG2RAD)*Math.sin(cam_heading*DEG2RAD);
            var camUpY = ratioUp*Math.cos((cam_pitch-90.0)*DEG2RAD);
            var camUpZ = ratioUp*Math.sin((cam_pitch-90.0)*DEG2RAD)*Math.cos(cam_heading*DEG2RAD);
            var camRightX = ratioRight*Math.sin((cam_heading-90.0)*DEG2RAD);
            var camRightY = 0.0;
            var camRightZ = ratioRight*Math.cos((cam_heading-90.0)*DEG2RAD);
            var camPlaneOriginX = camDirX + 0.5*camUpX - 0.5*camRightX;
            var camPlaneOriginY = camDirY + 0.5*camUpY - 0.5*camRightY;
            var camPlaneOriginZ = camDirZ + 0.5*camUpZ - 0.5*camRightZ;

            this.gl.uniform3f(this.attribs.cam_up, camUpX, camUpY, camUpZ);
            this.gl.uniform3f(this.attribs.cam_right, camRightX, camRightY, camRightZ);
            this.gl.uniform3f(this.attribs.cam_plane, camPlaneOriginX, camPlaneOriginY, camPlaneOriginZ);

            this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
        }
    });

function drawRoundedRect(ctx, ox, oy, w, h, radius){
  ctx.beginPath();
  ctx.moveTo(ox + radius,oy);
  ctx.lineTo(ox + w - radius,oy);
  ctx.arc(ox +w-radius,oy+ radius, radius,-Math.PI/2,0, false);
  ctx.lineTo(ox + w,oy + h - radius);
  ctx.arc(ox +w-radius,oy + h - radius, radius,0,Math.PI/2, false);
  ctx.lineTo(ox + radius,oy + h);
  ctx.arc(ox + radius,oy + h - radius, radius,Math.PI/2,Math.PI, false);
  ctx.lineTo(ox,oy + radius);
  ctx.arc(ox + radius,oy + radius, radius,Math.PI,3*Math.PI/2, false);
  ctx.fill();
}

function draw(){
  if(pano_canvas != null && pano_canvas.getContext != null){
    var ctx = pano_canvas.getContext("2d");

    if(target == null) {
      //clear canvas
      ctx.fillStyle = "rgba(0, 0, 0, 1)";
      ctx.fillRect(0, 0, pano_canvas.width, pano_canvas.height);

      ctx = pano_canvas.getContext("2d");
      target = ctx.getImageData(0, 0, pano_canvas.width, pano_canvas.height);
    }

    //render paromana direct
    var startTime = new Date();
    renderPanorama(pano_canvas);
    var endTime = new Date();

    if (displayMenu) {
      drawMenu(ctx);
    }

    if (displayInfo) {
      drawInfo(ctx, startTime, endTime);
    }

    if (displayHelp) {
      drawHelp(ctx);
    }
  }
}

function drawInfo(ctx, startTime, endTime) {
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  drawRoundedRect(ctx, 20, pano_canvas.height-60-20, 180, 60, 7);

  ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
  ctx.font="10pt helvetica";

  ctx.fillText("Canvas = " +  pano_canvas.width + "x" + pano_canvas.height, 30, pano_canvas.height-60);
  ctx.fillText("Image size = " + img.width + "x" + img.height, 30, pano_canvas.height-45);
  ctx.fillText("FPS = " + ((endTime.getTime()-startTime.getTime())).toFixed(1), 30, pano_canvas.height-30);
}

function drawHelp(ctx) {
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  drawRoundedRect(ctx, 20, 50, 180, 60, 7);

  ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
  ctx.font="10pt helvetica";

  ctx.fillText("m - Toggle menu on/off", 30, 70);
  ctx.fillText("i   - Toggle info on/off", 30, 85);
  ctx.fillText("?  - Toggle help on/off", 30, 100);
}

function drawMenu(ctx) {
  ctx.fillStyle = "rgba(30, 30, 30, 0.4)";
  ctx.fillRect(0, 0, pano_canvas.width, 30);

  ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
  ctx.font = "10pt Helvetica";
  ctx.fillText("Press ? for help", 10, 20);
}
