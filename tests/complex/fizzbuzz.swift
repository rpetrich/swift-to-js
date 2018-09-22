public func fizzBuzz() -> [String] {
    return (1...100).map { $0 % 3 == 0 ? $0 % 5 == 0 ? "FizzBuzz" : "Fizz" : $0 % 5 == 0 ? "Buzz" : String($0) };
}
