<template>
  <div ref="mapContainer" class="map-container"></div>
</template>

<script setup lang="ts">
import {onMounted, ref, render} from "vue";
import * as PIXI from "pixi.js";
import {Viewport} from "pixi-viewport";
import {useRouter} from "vue-router";
import {GraphicsDrawHelper} from "@/helpers/graphicsDrawHelper.ts";
import {TileClient} from "@/client/tileClient.ts";

const router = useRouter()
const mapContainer = ref<HTMLDivElement>()

let pixiApp: PIXI.Application
let worldContainer: PIXI.Container
let viewport: Viewport
let graphicsDrawHelper: GraphicsDrawHelper

onMounted(async () => {
  await initPixi(2000, 2000, true)
  drawWorldBorder()

  graphicsDrawHelper.drawGraphicsByGrid(20)

  // todo тут будем отрисовывать компонеты
})

async function initPixi(worldWidth: number, worldHeight: number, showWorldBorder: boolean) {
  if (!mapContainer.value) throw new Error("mapContainer is undefined")

  pixiApp = new PIXI.Application();
  await pixiApp.init({
    width: mapContainer.value.clientWidth,
    height: mapContainer.value.clientHeight,
    backgroundColor: 0xB0B8B0,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  })
  mapContainer.value.appendChild(pixiApp.canvas)

  viewport = new Viewport({
    screenWidth: mapContainer.value.clientWidth,
    screenHeight: mapContainer.value.clientHeight,
    worldWidth: worldWidth,
    worldHeight: worldHeight,
    events: pixiApp.renderer.events,
    passiveWheel: false,
  })
  viewport.drag().wheel().decelerate()
  pixiApp.stage.addChild(viewport)

  worldContainer = new PIXI.Container();
  worldContainer.position.set(worldWidth / 2, worldHeight / 2);
  viewport.addChild(worldContainer)

  graphicsDrawHelper = new GraphicsDrawHelper(pixiApp, worldContainer)

  console.log(await (new TileClient().GetHello()))
}

function drawWorldBorder() {
  const worldBorder = new PIXI.Graphics();
  worldBorder.stroke({ width: 2, color: 0xffffff, alpha: 0.7 })
    .rect(- viewport.worldWidth / 2 , - viewport.worldHeight / 2, viewport.worldWidth, viewport.worldHeight)
    .stroke();
  worldContainer.addChild(worldBorder);
}

</script>

<style scoped>
.map-container {
  width: 100%;
  height: 100%;
  overflow: hidden;
  position: relative;
}
</style>
