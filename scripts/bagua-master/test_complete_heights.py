import unittest
from complete_heights import simulate


class SimulationTest(unittest.TestCase):
    def test_reproducible_independent_of_call_order(self):
        args=('id-a',(771000,9377000),120,1.5,[3,4.5,5.5,6,7,9],3)
        first=simulate(*args)
        simulate('other',(1,2),100,1,[4,5],None)
        self.assertEqual(first,simulate(*args))

    def test_bounded_and_varied(self):
        heights=[simulate(str(i),(771000,9377000),120,1.5,[3,4.5,5.5,6,7,9],3)[0] for i in range(1000)]
        self.assertGreaterEqual(min(heights),2.7)
        self.assertLessEqual(max(heights),18)
        self.assertGreater(len(set(heights)),10)
        self.assertGreater(sum(h<10 for h in heights),900)

    def test_small_and_elongated_footprint_priors(self):
        for i in range(50):
            self.assertLessEqual(simulate(str(i),(1,2),20,1,[30,40],30)[0],3.5)
            self.assertLessEqual(simulate(str(i),(1,2),800,5,[30,40],30)[0],9.5)

    def test_neighbourhood_context_is_not_an_individual_measurement(self):
        low=simulate('id',(1,2),100,1,[5,6,7],3)[1]
        high=simulate('id',(1,2),100,1,[5,6,7],12)[1]
        self.assertGreater(high,low)
        self.assertNotEqual(high,12)

    def test_empty_pool_uses_explicit_model_prior(self):
        height,reference=simulate('id',(1,2),100,1,[],None)
        self.assertEqual(reference,5.5)
        self.assertGreaterEqual(height,2.7)


if __name__=='__main__':unittest.main()
