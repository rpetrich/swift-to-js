public func distanceToZero(ofPoint point:(Double, Double)) -> Double {
    let (x, y) = point
    return (x * x + y * y).squareRoot()
}
