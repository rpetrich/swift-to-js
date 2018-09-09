public enum Barcode {
	case empty
    case upc(Int, Int, Int, Int)
    case qrCode(String)
}

public func makeEmpty() -> Barcode {
	return .empty
}

public func makeUpc(numberSystem: Int, manufacturer: Int, product: Int, check: Int) -> Barcode {
	return .upc(numberSystem, manufacturer, product, check)
}

public func makeQr(value: String) -> Barcode {
	return .qrCode(value)
}

public func describe(barcode: Barcode) -> String {
	switch barcode {
		case .empty:
			return "Empty"
		case .upc(let numberSystem, let manufacturer, let product, let check):
			return "UPC:" + String(numberSystem) + "-" + String(manufacturer) + "-" + String(product) + "-" + String(check)
		case .qrCode(let value):
			return "QR:" + value
	}
}
