"""Comprueba que la derivación nunca rellena alturas sin respaldo suficiente."""
import unittest
import numpy as np
from rasterio.transform import from_origin
from shapely.geometry import box
from estimate_heights import estimate


class HeightQualityTest(unittest.TestCase):
    def setUp(self):
        self.affine = from_origin(0, 8, 2, 2)
        self.buildings = [('a', box(0, 0, 8, 8))]
        self.heights = np.full((4, 4), 6.0)
        self.presence = np.ones((4, 4))

    def test_median_and_original_identifier(self):
        self.heights[0, 0] = 90
        self.assertEqual(estimate(self.buildings,self.heights,self.presence,self.affine)['a'], (6,1,16))

    def test_rejects_low_presence(self):
        self.presence[:] = 0.6
        self.assertEqual(estimate(self.buildings,self.heights,self.presence,self.affine), {})

    def test_rejects_insufficient_coverage(self):
        self.heights[:3,:] = -99
        self.assertEqual(estimate(self.buildings,self.heights,self.presence,self.affine), {})

    def test_rejects_fewer_than_four_samples(self):
        self.assertEqual(estimate([('small',box(0,0,2,2))],self.heights,self.presence,self.affine), {})

    def test_rejects_outside_tile_instead_of_extrapolating(self):
        self.assertEqual(estimate([('outside',box(-2,0,8,8))],self.heights,self.presence,self.affine), {})

    def test_rejects_nan_and_impossible_heights(self):
        for value in [np.nan, -99, 0, 101]:
            self.heights[:] = value
            self.assertEqual(estimate(self.buildings,self.heights,self.presence,self.affine), {})


if __name__ == '__main__':
    unittest.main()
