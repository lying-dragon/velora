export function validateRide(ride) {
  if (
    !ride ||
    !/^[-a-z0-9]{10,60}$/.test(ride.id) ||
    typeof ride.title !== "string" ||
    ride.title.length > 160 ||
    typeof ride.description !== "string" ||
    ride.description.length > 5000 ||
    typeof ride.tcx !== "string" ||
    ride.tcx.length > 12000000 ||
    !ride.tcx.includes("<TrainingCenterDatabase") ||
    typeof ride.png !== "string" ||
    !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(ride.png) ||
    ride.png.length > 3000000 ||
    !["demo", "ant", "ble", "serial"].includes(ride.source) ||
    !Number.isFinite(ride.duration) ||
    ride.duration < 0 ||
    ride.duration > 86400
  )
    throw new Error("라이딩 파일 형식이 올바르지 않습니다.");
  return {
    id: ride.id,
    title: ride.title,
    description: ride.description,
    tcx: ride.tcx,
    png: ride.png,
    source: ride.source,
    duration: ride.duration,
  };
}
