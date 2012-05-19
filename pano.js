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
  draw();
}

function imageLoaded(){
  var buffer = document.createElement("canvas");
  var buffer_ctx = buffer.getContext("2d");

  //set buffer size
  var tex_resolution = 2048;
  buffer.width = tex_resolution;
  buffer.height = tex_resolution;

  //draw image
  var scale = tex_resolution / img.width;
  buffer_ctx.drawImage(img,
          0, (tex_resolution - img.height * scale) / 2,
          tex_resolution, img.height * scale);

  //get pixels
  source = buffer_ctx.getImageData(0, 0, tex_resolution, tex_resolution);
  renderer.setImage(source, img.height * scale);

  resizeCanvas();
}

function mouseDown(e){
  mouseIsDown = true;
  mouseDownPosLastX = e.clientX;
  mouseDownPosLastY = e.clientY;
}

function mouseMove(e){
  if(mouseIsDown == true){
    cam_heading -= (e.clientX-mouseDownPosLastX);
    cam_pitch += 0.5*(e.clientY-mouseDownPosLastY);
    mouseDownPosLastX = e.clientX;
    mouseDownPosLastY = e.clientY;
    draw();
  }
}

function mouseUp(e){
  mouseIsDown = false;
  draw();
}

function mouseScroll(e){
  cam_fov+=e.wheelDelta/120;
  draw();
}

function keyDown(e) {
  switch(e.keyCode) {
    // i = info
    case 73:
      displayInfo = !displayInfo;
      draw();
      break;
    // m = menu
    case 77:
      displayMenu = !displayMenu;
      draw();
      break;
    // ? = help
    case 191:
      displayHelp = !displayHelp;
      draw();
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

draw_count = 0;
function drawQuad(src, sscanwidth, sofs, tgt, tscanwidth, tofs,
                  sxl0, syl0, sxl1, syl1, sxr0, syr0, sxr1, syr1,
                  tx0, ty0, dtx, dty) {
  var dxl = sxl1 - sxl0;
  var dyl = syl1 - syl0;

  var dxr = sxr1 - sxr0;
  var dyr = syr1 - syr0;

  var xl = sxl0, yl = syl0, xr = sxr0, yr = syr0;

  var ty = Math.floor(ty0);
  for(var row = 0; row < dty; row++) {
    //if(ty > Math.floor(ty0) && ty < tyend - 1) continue;
    // Draw a line from xl to xr
    var ixl = Math.floor(xl), iyl = Math.floor(yl),
    ixr = Math.floor(xr), iyr = Math.floor(yr);
    var dx = Math.abs(ixr - ixl);
    var dy = -Math.abs(iyr - iyl);
    var dist = Math.sqrt(dx*dx + dy*dy);
    var sx = (ixl < ixr) ? 1 : -1;
    var sy = (iyl < iyr) ? 1 : -1;
    var err1 = dx + dy;
    var err2;

    var steps = (dx > -dy) ? dx : -dy;
    var tgt_step = dtx / steps;
    var tgt_frac = 0;
    var tgt_bla = 0;

    var x = ixl;
    var y = iyl;

    var tx = Math.floor(tx0);
    var txend = Math.floor(tx0 + dtx);
    var tgt_offset = 4*(ty * tscanwidth + tx + tofs);
    while(true) {
      tgt_frac += tgt_step;
      if(tgt_bla < tgt_frac)
        var src_offset=4*(y * sscanwidth +
                          (((x + sofs) % sscanwidth) + sscanwidth) % sscanwidth);

      while(tx <= txend) {
        if (tgt_bla >= tgt_frac) break;
        tgt_bla++;
        // Draw pixel.
        tgt[tgt_offset]     = src[src_offset];
        tgt[tgt_offset+1]   = src[src_offset+1];
        tgt[tgt_offset+2]   = src[src_offset+2];
        draw_count++;
        tx++;
        tgt_offset += 4;
      }

      if (x == ixr && y == iyr)
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

    xl = sxl0 + dxl * row / dty;
    yl = syl0 + dyl * row / dty;
    xr = sxr0 + dxr * row / dty;
    yr = syr0 + dyr * row / dty;
    ty++;
  }
}

function renderPanorama(canvas){
  if(canvas != null && source != null){
    var ctx         = canvas.getContext("2d");
    var src_width   = img.width;
    var src_height  = img.height;
    var dest_width  = canvas.width;
    var dest_height = canvas.height;

    //ctx.drawImage(img, 0, 0, img.width, img.height, dest_width, 0,
    //        dest_width, dest_height);

    //calculate camera plane
    var theta_fac = src_height/Math.PI;
    var phi_fac = src_width*0.5/Math.PI
    var ratioUp = 2.0*Math.tan(cam_fov*DEG2RAD/2.0);
    var ratioRight = ratioUp*(16/9);
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

    var fx = 0.5, fy = 0.5;
    var rayX = camPlaneOriginX + fx*camRightX - fy*camUpX;
    var rayZ = camPlaneOriginZ + fx*camRightZ - fy*camUpZ;
    var x_shift=(Math.atan2(rayZ,rayX) + Math.PI) * phi_fac;

    var camDirX = 0.0;
    var camDirZ = Math.sin(cam_pitch*DEG2RAD);
    var camUpX = 0.0;
    var camUpZ = ratioUp*Math.sin((cam_pitch-90.0)*DEG2RAD);
    var camRightX = -ratioRight;
    var camRightZ = 0.0;
    var camPlaneOriginX = camDirX + 0.5*camUpX - 0.5*camRightX;
    var camPlaneOriginY = camDirY + 0.5*camUpY - 0.5*camRightY;
    var camPlaneOriginZ = camDirZ + 0.5*camUpZ - 0.5*camRightZ;

    //render image
    var i,j;
    var frac_fx = 1/dest_width;
    var frac_fy = 1/dest_height;
    var fx = 0;
    var fy = 0;
    var min_y = 0;
    var max_y = 0;
    var res = 8;
    var x_res = (dest_width - 1) / res, y_res = (dest_height - 1) / res;
    var line_x1 = new Array(res+1);
    var line_y1 = new Array(res+1);
    var line_x2 = new Array(res+1);
    var line_y2 = new Array(res+1);
    draw_count = 0;
    for(i=0; i<res+1; i++){
      var fy = i/res;
      var line_i = 0;

      for(j=0; j<res+1; j++){
        var fx = j/res;

        /* LOOKUP Tabellen für acos und atan2? */
        /* Bringen nix vllt nur horizontal mit shear */
        var rayX = camPlaneOriginX + fx*camRightX - fy*camUpX;
        var rayY = camPlaneOriginY + fx*camRightY - fy*camUpY;
        var rayZ = camPlaneOriginZ + fx*camRightZ - fy*camUpZ;
        var rayNorm = 1.0/Math.sqrt(rayX*rayX + rayY*rayY + rayZ*rayZ);

        var theta = Math.acos(rayY*rayNorm);
        var phi = Math.atan2(rayZ,rayX);
        var theta_i = theta_fac*theta;
        var phi_i = phi_fac*phi;

        var y = theta_i;
        var x = phi_i + x_shift;
        line_x1[line_i] = x;
        line_y1[line_i] = y;

        /*var offset=4*(Math.floor(y / src_height * dest_height) * dest_width * 2 +
                Math.floor(x / src_width * dest_width) + dest_width);

        pixels[offset]     = 0xff;
        pixels[offset+1]   = 0xff;
        pixels[offset+2]   = 0xff;*/
        line_i++;
      }

      if(i > 0) {
        for(var line_i=0; line_i < line_x1.length-1; line_i++) {
          drawQuad(source.data, src_width, 0,
                   target.data, dest_width, 0,
                   line_x2[line_i], line_y2[line_i],
                   line_x1[line_i], line_y1[line_i],
                   line_x2[line_i+1], line_y2[line_i+1],
                   line_x1[line_i+1], line_y1[line_i+1],
                   line_i * x_res, (i - 1) * y_res, x_res, y_res);
        }
      }
      var t = line_x1;
      line_x1 = line_x2;
      line_x2 = t;
      var t = line_y1;
      line_y1 = line_y2;
      line_y2 = t;
    }

    //upload image data
    ctx.putImageData(target, 0, 0);
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

            this.attribs = {
                vertex: this.gl.getAttribLocation(this.program, 'vertex'),
                cam: this.gl.getAttribLocation(this.program, 'cam'),
                texture: this.gl.getUniformLocation(this.program, 'texture_img'),
                texture_size: this.gl.getUniformLocation(this.program, 'texture_size'),
                panorama_height: this.gl.getUniformLocation(this.program, 'panorama_height'),
                viewport_size: this.gl.getUniformLocation(this.program, 'viewport_size'),
                cam_up: this.gl.getUniformLocation(this.program, 'cam_up'),
                cam_right: this.gl.getUniformLocation(this.program, 'cam_right'),
                cam_plane: this.gl.getUniformLocation(this.program, 'cam_plane'),
            }

            this.texture = this.gl.createTexture();
            this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
            this.gl.texParameteri(this.gl.TEXTURE_2D,
                    this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
            this.gl.texParameteri(this.gl.TEXTURE_2D,
                    this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
            this.gl.uniform1i(this.attribs.texture, 0);

            this.vertex_buffer = this.gl.createBuffer();
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertex_buffer);
            this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array([
                    -1, 1, 0,
                    1, 1, 0,
                    -1, -1, 0,
                    1, -1, 0
                     ]), this.gl.STATIC_DRAW);

            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertex_buffer);
            this.gl.enableVertexAttribArray(this.attribs.vertex);
            this.gl.vertexAttribPointer(this.attribs.vertex, 3, this.gl.FLOAT,
                    false, 3*4, 0*4);

            this.gl.activeTexture(this.gl.TEXTURE0);
        },
        setImage: function(data, panorama_height) {
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
        draw: function() {
            var ratioUp = 2.0*Math.tan(cam_fov*DEG2RAD/2.0);
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

            this.gl.uniform2f(this.attribs.viewport_size,
                    this.canvas.width, this.canvas.height);
            this.gl.uniform3f(this.attribs.cam_up, camUpX, camUpY, camUpZ);
            this.gl.uniform3f(this.attribs.cam_right, camRightX, camRightY, camRightZ);
            this.gl.uniform3f(this.attribs.cam_plane, camPlaneOriginX, camPlaneOriginY, camPlaneOriginZ);

            this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
            this.gl.clearColor(0.5, 0., 0., 1.);
            this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);

            this.gl.vertexAttrib2f(this.cam_loc, this.rx, this.ry);
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
  renderer.draw();
  return;
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
