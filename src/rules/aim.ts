/* Turning a drag on the screen into a launch. */
export const AIM = {
  pullScreenShare: .32,   // drag this share of the screen height down for full power
  aimScreenShare: .45,    // drag this share of the width sideways for full aim
  maxHeading: .3,         // radians
  minPower: .12,          // a smaller pull than this does nothing
  pullBack: 1.6,          // metres the car slides back at full power
};

export function pullFromDrag(dx: number, dy: number, width: number, height: number) {
  const power = Math.max(0, Math.min(1, dy / (height * AIM.pullScreenShare)));
  const heading = Math.max(-AIM.maxHeading, Math.min(AIM.maxHeading, dx / (width * AIM.aimScreenShare) * AIM.maxHeading));
  return { power, heading };
}

export const canLaunch = (power: number) => power >= AIM.minPower;
