public func fizzBuzz() -> [String] {
    return (1...100).map { (num: Int) -> String in return num % 3 == 0 ? num % 5 == 0 ? "FizzBuzz" : "Fizz" : num % 5 == 0 ? "Buzz" : String(num) };
}
