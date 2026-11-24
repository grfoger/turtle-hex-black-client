import * as PIXI from "pixi.js";

export class GraphicsDrawHelper {
  private worldContainer: PIXI.Container;
  private pixiApp: PIXI.Application;

  constructor(pixiApp: PIXI.Application, worldContainer: PIXI.Container) {
    this.pixiApp = pixiApp;
    this.worldContainer = worldContainer;
  }

  drawGraphicsObj(obj: PIXI.Graphics, position: { x: number, y: number }) {
    obj.position.set(position.x, position.y);
    this.worldContainer.addChild(obj)
  }

  drawGraphicsByGrid(gridSize: number) {

    const vertStep = gridSize;
    const horizStep = ( Math.sqrt(3) * gridSize ) / 2;

    const basePoint = { x: - 3 * horizStep, y: - 4.5 * vertStep };
    // draw body
    for (let i = 0; i < 7; i++) {
      const isEven = i % 2 === 0;
      this.drawNObjLine(10, gridSize,
        {
          x: basePoint.x + horizStep * i,
          y: isEven ? basePoint.y : basePoint.y - vertStep / 2,
        });
    }
  }

  private drawNObjLine(count: number, lineStep: number, basePoint: {x: number, y: number}) {
    for (let i = 0; i < count; i++) {
      const obj = this.getBaseHex(lineStep)
      this.drawGraphicsObj(obj, { x: basePoint.x, y: basePoint.y + lineStep * i});
    }
  }

  getBaseHex(size: number, isVertical: boolean = true) {
    const hex = new PIXI.Graphics();
    const r = size / 2;
    const points: {x: number, y: number }[] = [
      {x: - (2 * r) / Math.sqrt(3), y: 0},
      {x: - r / Math.sqrt(3), y: - r },
      {x: r / Math.sqrt(3), y: -r },
      {x: (2 * r) / Math.sqrt(3), y: 0},
      {x: r / Math.sqrt(3), y: r },
      {x: - r / Math.sqrt(3), y: r },
    ];

    hex.poly(points);
    hex.stroke({ width: 2, color: 0xffffff })
    return hex
  }
}
