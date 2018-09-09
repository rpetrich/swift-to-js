public enum Barcode {
	case empty
    case upc(Int)
    case qrCode(String)
}

public func make(empty: ()) -> Barcode {
	return .empty
}

public func make(upc value: Int) -> Barcode {
	return .upc(value)
}

public func make(qrCode value: String) -> Barcode {
	return .qrCode(value)
}

public func describe(barcode: Barcode) -> String {
	switch barcode {
		case .empty:
			return "Empty"
		case .upc(let value):
			return "UPC:" + String(value)
		case .qrCode(let value):
			return "QR:" + value
	}
}
