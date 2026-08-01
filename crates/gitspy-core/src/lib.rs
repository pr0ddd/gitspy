#![forbid(unsafe_code)]

//! Раскладка графа коммитов: топология на входе, дорожки, цвета и сегменты рёбер на выходе.
//!
//! Крейт не знает ни про диск, ни про git, ни про пиксели. Цвет здесь — индекс в палитре;
//! конкретные значения цветов и вся геометрия принадлежат renderer'у.

pub mod chunk;
pub mod colour;
pub mod dump;
pub mod fixture;
pub mod layout;
pub mod state;
pub mod topology;

pub use topology::{CommitIdx, Topology, TopologyError};
