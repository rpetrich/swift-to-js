public func fizzBuzz(of val: Int) -> String {
    return val % 3 == 0 ? val % 5 == 0 ? "FizzBuzz" : "Fizz" : val % 5 == 0 ? "Buzz" : String(val);
}
