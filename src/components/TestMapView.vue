<template>
  <div ref="pixiContainer" class="pixi-container"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import * as PIXI from 'pixi.js'
import { Viewport } from 'pixi-viewport'

const router = useRouter()
const pixiContainer = ref<HTMLDivElement>()

let app: PIXI.Application
let viewport: Viewport

// Радиусы (пиксели)
const SMALL_RADIUS = 30
const BIG_RADIUS = 300
const dx = Math.sqrt(3) * BIG_RADIUS   // ~519.6
const dy = 1.5 * BIG_RADIUS            // 450

const bigHexData = [
  { id: 0, x: 0, y: 0 },                          // центр
  { id: 1, x: 0, y: -dy },                         // север
  { id: 2, x: dx, y: -dy/2 },                       // северо-восток
  { id: 3, x: -dx, y: -dy/2 },                      // северо-запад
  { id: 4, x: 0, y: dy },                           // юг
  { id: 5, x: dx, y: dy/2 },                        // юго-восток
  { id: 6, x: -dx, y: dy/2 }                        // юго-запад
]
// Цвета для больших гексов (как раньше)
const bigColors = [0xff4444, 0x44ff44, 0x4444ff, 0xffff44, 0xff44ff, 0x44ffff, 0xaaaaaa]

onMounted(async () => {
  if (!pixiContainer.value) return

  // 1. Создаём и инициализируем приложение Pixi
  app = new PIXI.Application()
  await app.init({
    width: pixiContainer.value.clientWidth,
    height: pixiContainer.value.clientHeight,
    backgroundColor: 0x2a2a2a,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  })

  if (!pixiContainer.value) return
  pixiContainer.value.appendChild(app.canvas)

  // 2. Создаём viewport
  viewport = new Viewport({
    screenWidth: pixiContainer.value.clientWidth,
    screenHeight: pixiContainer.value.clientHeight,
    worldWidth: 2000,
    worldHeight: 2000,
    events: app.renderer.events,
    passiveWheel: false,
  })

  viewport.drag().wheel().decelerate()
  app.stage.addChild(viewport)

  // 3. Контейнер для всех гексов
  const hexContainer = new PIXI.Container()
  viewport.addChild(hexContainer)

  // 4. Генерируем текстуру маленького гекса (из Graphics)
  const smallHexTexture = await createHexTexture(SMALL_RADIUS, 0x88aa88, app.renderer)

  // 5. Генерируем маленькие гексы внутри центрального большого гекса
  const smallHexes = generateSmallHexes(
    bigHexData[0].x,
    bigHexData[0].y,
    BIG_RADIUS,
    SMALL_RADIUS,
    smallHexTexture,
    0x88aa88 // базовый цвет (можно через tint менять, но оставим один)
  )
  smallHexes.forEach(hex => hexContainer.addChild(hex))

  // 6. Создаём спрайты для больших гексов (только контуры, чтобы не закрывать мелкие)
  for (const item of bigHexData) {
    // Для больших используем отдельную текстуру (или можно прямо Graphics)
    // Создадим текстуру большого гекса-контура (без заливки)
    const bigHexSprite = await createBigHexOutline(BIG_RADIUS, bigColors[item.id], app.renderer)
    bigHexSprite.position.set(item.x, item.y)
    bigHexSprite.eventMode = 'static'
    bigHexSprite.cursor = 'pointer'
    bigHexSprite.on('pointertap', () => {
      router.push(`/hex/${item.id}`)
    })
    hexContainer.addChild(bigHexSprite)
  }

  // Центрируем viewport
  viewport.moveCenter(0, 0)
  window.addEventListener('resize', onResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', onResize)
  app?.destroy(true)
})

function onResize() {
  if (!pixiContainer.value || !app || !viewport) return
  const width = pixiContainer.value.clientWidth
  const height = pixiContainer.value.clientHeight
  app.renderer.resize(width, height)
  viewport.resize(width, height)
}

// Создаёт текстуру маленького гекса с заливкой и обводкой
async function createHexTexture(radius: number, color: number, renderer: PIXI.Renderer): Promise<PIXI.Texture> {
  const graphics = new PIXI.Graphics()
  const points = Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 3) * i
    return [radius * Math.cos(angle), radius * Math.sin(angle)]
  }).flat()
  graphics.poly(points).fill({ color }).stroke({ width: 1, color: 0x000000 })
  return renderer.generateTexture(graphics)
}

// Создаёт текстуру большого гекса-контура (только обводка, без заливки)
async function createBigHexOutline(radius: number, color: number, renderer: PIXI.Renderer): Promise<PIXI.Sprite> {
  const graphics = new PIXI.Graphics()
  const points = Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 3) * i
    return [radius * Math.cos(angle), radius * Math.sin(angle)]
  }).flat()
  graphics.poly(points).stroke({ width: 3, color })
  const texture = await renderer.generateTexture(graphics)
  return new PIXI.Sprite(texture)
}

// Генерирует массив спрайтов маленьких гексов внутри большого шестиугольника
function generateSmallHexes(
  centerX: number,
  centerY: number,
  bigR: number,
  smallR: number,
  texture: PIXI.Texture,
  tint: number = 0xffffff
): PIXI.Sprite[] {
  const sprites: PIXI.Sprite[] = []
  const stepX = Math.sqrt(3) * smallR
  const stepY = 1.5 * smallR

  // Границы области поиска (немного больше, чтобы не пропустить)
  const minX = centerX - bigR - stepX
  const maxX = centerX + bigR + stepX
  const minY = centerY - bigR - stepY
  const maxY = centerY + bigR + stepY

  for (let y = minY; y <= maxY; y += stepY) {
    // Определяем смещение для чётных рядов (pointy-top)
    const row = Math.round((y - centerY) / stepY)
    const xOffset = (Math.abs(row) % 2) * (stepX / 2)

    for (let x = minX + xOffset; x <= maxX; x += stepX) {
      if (pointInHexagon(x, y, centerX, centerY, bigR)) {
        const sprite = new PIXI.Sprite(texture)
        sprite.position.set(x, y)
        sprite.anchor.set(0.5) // важно: центр спрайта совпадает с центром гекса
        sprite.tint = tint
        sprite.eventMode = 'none' // мелкие не интерактивны
        sprites.push(sprite)
      }
    }
  }
  return sprites
}

// Проверка, попадает ли точка внутрь шестиугольника (pointy-top)
function pointInHexagon(px: number, py: number, cx: number, cy: number, R: number): boolean {
  const dx = Math.abs(px - cx)
  const dy = Math.abs(py - cy)
  const halfHeight = R * Math.sqrt(3) / 2
  if (dy > halfHeight) return false
  const widthAtY = R * (1 - dy / halfHeight)
  return dx <= widthAtY
}
</script>

<style scoped>
.pixi-container {
  width: 100%;
  height: 100%;
  overflow: hidden;
  position: relative;
}
</style>
