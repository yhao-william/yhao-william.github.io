(function(){
  "use strict";
  var body = document.body;
  var loader = document.querySelector(".loader");
  if(!loader){ return; }

  /* Skip entirely on repeat visit */
  var firstLoaded = sessionStorage.getItem("firstLoaded");
  if(firstLoaded === "done"){
    body.classList.add("-readyend","skipAnimation");
    setTimeout(function(){ body.classList.remove("skipAnimation"); }, 200);
    /* Signal ocean script: loader already done, start ocean immediately */
    window.loaderFinished = true;
    if(window.onLoaderFinished) window.onLoaderFinished();
    return;
  }

  var logo = document.querySelector(".js-loaderlogo");
  function positionLogo(){
    if(!logo){ return; }
    logo.style.visibility = "visible";
  }

  function shiftStripDelays(shiftSeconds){
    var strips = document.querySelectorAll(".loader__blks .blk, .loader__blks .blk2");
    for(var i=0;i<strips.length;i++){
      var el = strips[i];
      var d = window.getComputedStyle(el).animationDelay || "0s";
      var sec = parseFloat(d) || 0;
      var out = (sec + shiftSeconds).toFixed(3).replace(/\.000$/,"") + "s";
      el.style.animationDelay = out;
      el.style.webkitAnimationDelay = out;
    }
  }

  var spans = logo ? logo.querySelectorAll("span") : [];
  var charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!#$%&*+?^;:".split("");

  function randChar(){
    return charset[Math.floor(Math.random()*charset.length)];
  }

  function scrambleSpan(span, finalChar, startDelay, duration, keep){
    window.setTimeout(function(){
      if(keep){
        span.textContent = finalChar;
        return;
      }
      var start = Date.now();
      var iv = window.setInterval(function(){
        var elapsed = Date.now() - start;
        if(elapsed >= duration){
          window.clearInterval(iv);
          span.textContent = finalChar;
          return;
        }
        span.textContent = randChar();
      }, 18);
    }, startDelay);
  }

  /* ---- Auto-start loader on page load ---- */
  positionLogo();
  shiftStripDelays(1.55);

  /* 1) 1s: trigger blocks + logo curtain */
  setTimeout(function(){
    body.classList.add("-ready");
  }, 1000);

  /* 2) 3.3s: morph text */
  setTimeout(function(){
    if(!logo || !spans.length){ return; }
    var step = 20;
    var baseDelay = 60;
    var baseDur = 300;
    var scrambleIdx = 0;

    for(var i=0;i<spans.length;i++){
      var s = spans[i];
      var finalChar = s.getAttribute("data-final");
      if(finalChar === null){ finalChar = s.textContent || ""; }
      if(s.classList && s.classList.contains("sp")){ finalChar = "\u00A0"; }
      var keep = (i===0 || i===8 || i===9);
      if(keep){ scrambleSpan(s, finalChar, 0, 0, true); continue; }
      var stagger = scrambleIdx * step;
      scrambleIdx++;
      var dur = baseDur + Math.min(140, stagger*0.15);
      scrambleSpan(s, finalChar, baseDelay + stagger, dur, false);
    }
  }, 3300);

  /* 3) 8.2s: loader ends → fade out loader, then signal ocean */
  setTimeout(function(){
    sessionStorage.setItem("firstLoaded","done");

    /* Fade loader out over 0.8s instead of instant hide */
    loader.style.transition = "opacity 0.8s ease";
    loader.style.opacity = "0";

    setTimeout(function(){
      body.classList.add("-readyend");
      loader.style.display = "none";
      /* Signal the ocean/glitch script to begin */
      window.loaderFinished = true;
      if(window.onLoaderFinished) window.onLoaderFinished();
    }, 850);
  }, 8200);

  window.addEventListener("resize", function(){ setTimeout(positionLogo, 0); });
})();
